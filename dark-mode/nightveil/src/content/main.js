// src/content/main.js
// Content pipeline: read settings at document_start, gate on scope (global
// state × site lists) and page exclusion rules, then inject/remove the
// classic theme, apply a flash guard while active, and re-render on changes.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, subscribeSettings } from '../shared/settings.js';
import { compileThemeById, guardBackgroundFor } from '../shared/themes.js';
import { findPalette } from '../shared/palettes.js';
import { siteDarkActive } from '../shared/scope.js';
import { evaluateRules, luminanceOf, metaSchemeIsDark } from '../shared/exclusionRules.js';
import { matchSiteTheme, compileSiteTheme } from '../shared/siteThemes.js';
import { activateEngine, deactivateEngine, scheduleShadowScan, VARS_STYLE_ID } from './engine/engine.js';
import { ENGINE_VARIABLES } from '../shared/engineTheme.js';

const CLASSIC_STYLE_ID = 'nv-classic';
const GUARD_STYLE_ID = 'nv-guard';
const GUARD_REMOVE_DELAY_MS = 200;
const SITE_STYLE_ID = 'nv-site';
const SITE_ATTR = 'data-nv-site';
const STAGE_ATTR = 'data-nv-stage';

console.log(STRINGS.contentActiveLog);

// Shadow host hook notification (§5): the main-world script postMessage's on
// a host's first marking; route it into the engine scheduler's coalescing
// 'shadow' key (no-op unless the adaptive engine is active).
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.from === 'nv-shadow-attach') scheduleShadowScan();
});

function injectStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    (document.head ?? document.documentElement).appendChild(el);
  }
  el.textContent = css;
}

function removeStyle(id) {
  document.getElementById(id)?.remove();
}

let guardTimer = null;
// Guard dismissal machinery, shared by armGuard's load-bound path and the
// engine's first-rule hook (§2-4): clear any pending dismissal, then (re)arm
// the one module timer that removes the guard style. Removal is idempotent,
// so a double dismissal (first rule + load timer) is harmless.
function dismissGuardSoon() {
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = setTimeout(() => removeStyle(GUARD_STYLE_ID), GUARD_REMOVE_DELAY_MS);
}

function armGuard(settings, bgOverride) {
  const bg = bgOverride ?? guardBackgroundFor(findPalette(settings.themeId));
  injectStyle(GUARD_STYLE_ID, `html { background-color: ${bg} !important; }`);
  if (guardTimer) clearTimeout(guardTimer);
  if (document.readyState === 'complete') {
    dismissGuardSoon();
  } else {
    window.addEventListener('load', dismissGuardSoon, { once: true });
  }
}

function clearVideoStages() {
  for (const el of document.querySelectorAll(`[${STAGE_ATTR}]`)) el.removeAttribute(STAGE_ATTR);
}

// Mark the wrapper layers directly around media (<video> players and <img>
// cover cards) so overlay flattening keeps them transparent — otherwise
// originally-transparent layers (player danmaku/subtitles/controls, or card
// stats strips whose gradient background-IMAGE needs a transparent backdrop)
// paint opaque over the media. Known v1 limitation: media added later by an
// SPA are only marked on the next render.
function markMediaStages() {
  clearVideoStages();
  const mark = (start, maxW, maxH) => {
    let el = start;
    for (let i = 0; i < 8 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect();
      if (r.width > maxW || r.height > maxH) break;
      el.setAttribute(STAGE_ATTR, '');
      el = el.parentElement;
    }
  };
  for (const v of document.querySelectorAll('video')) {
    const vr = v.getBoundingClientRect();
    mark(v.parentElement, (vr.width || 1) * 1.5, Infinity);
  }
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 80 || !(img.complete && img.naturalWidth > 0)) continue;
    mark(img.parentElement, r.width * 1.5, r.height * 1.1);
  }
}

// 全屏透明布局层被压平成不透明幕布盖整页——恢复其透明；z<1000 门限避免误伤弹窗遮罩。
function markFullscreenOverlays() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const el of document.querySelectorAll('body *')) {
    if (el.hasAttribute(STAGE_ATTR)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
    const z = parseInt(cs.zIndex) || 0;
    if (z >= 1000) continue;
    el.setAttribute(STAGE_ATTR, '');
  }
}

// 图截文字第二式——字号归零藏字召回。
function recallZeroSizeText() {
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length !== 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.fontSize !== '0px') continue;
    let size = '12px';
    let a = el.parentElement;
    for (let i = 0; i < 6 && a; i++) {
      const fs = getComputedStyle(a).fontSize;
      if (fs !== '0px') { size = fs; break; }
      a = a.parentElement;
    }
    el.style.setProperty('font-size', size, 'important');
  }
}

// ---- page exclusion-rule probes (DOM side; matching logic lives in shared/) ----
function collectRuleSignals(includeBg) {
  const html = document.documentElement;
  const metaSchemeDark = [...document.querySelectorAll('meta[name="color-scheme" i], meta[name="supported-color-schemes" i]')]
    .some((m) => metaSchemeIsDark(m.getAttribute('content')));
  const htmlAttrs = html ? [...html.attributes].map((a) => (a.value === '' ? a.name : `${a.name}=${a.value}`)) : [];
  const htmlClasses = html ? [...html.classList] : [];
  const cookieNames = document.cookie.split(';').map((s) => s.split('=')[0].trim()).filter(Boolean);
  let bgLuminance = null;
  if (includeBg) {
    const el = document.body ?? document.documentElement;
    if (el) bgLuminance = luminanceOf(getComputedStyle(el).backgroundColor);
  }
  return { metaSchemeDark, htmlAttrs, htmlClasses, cookieNames, bgLuminance };
}

function teardown() {
  removeStyle(CLASSIC_STYLE_ID);
  removeStyle(GUARD_STYLE_ID);
  removeStyle(SITE_STYLE_ID);
  deactivateEngine();
  if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }
  document.documentElement?.removeAttribute(SITE_ATTR);
  clearVideoStages();
}

function applyTheme(settings) {
  const site = matchSiteTheme(location.hostname);
  const siteUsable = site && !(settings.disabledSiteThemes ?? []).includes(site.id);
  if (settings.themeId === 'adaptive') { applyEngine(settings, site, siteUsable); return; }
  applyClassic(settings, site, siteUsable);
}

function engineOwnsSite(policy, site) {
  // M2-BEHAVIOR §1: respect → site theme wins; ignore → engine always;
  // skip-compatible → engine only on compatible-marked sites.
  if (!site) return true;
  if (policy === 'ignore') return true;
  if (policy === 'respect') return false;
  return Boolean(site.compatible);
}

function applyEngine(settings, site, siteUsable) {
  armGuard(settings, ENGINE_VARIABLES['--nv-surface']);   // guard with the engine surface color
  if (engineOwnsSite(settings.engine.siteThemePolicy, siteUsable ? site : null)) {
    removeStyle(SITE_STYLE_ID);
    document.documentElement.removeAttribute(SITE_ATTR);
    // §2-4: a light page renders its first engine rule almost immediately —
    // dismiss the guard on that rule instead of waiting for load+200ms.
    // Heavy pages keep the load-bound path (their first paint lags load).
    const lightPage = document.querySelectorAll('*').length < 1000;
    activateEngine(settings, lightPage ? { onFirstRule: dismissGuardSoon } : undefined);
    return;
  }
  deactivateEngine();
  // site theme composes on the fixed base overlay (original dark.css parity)
  injectStyle(CLASSIC_STYLE_ID, compileThemeById('nv-simple'));
  document.documentElement.setAttribute(SITE_ATTR, site.id);
  injectStyle(SITE_STYLE_ID, compileSiteTheme(site.id));
  markMediaStages();
  markFullscreenOverlays();
  recallZeroSizeText();
  window.addEventListener('load', () => {
    if (document.getElementById(CLASSIC_STYLE_ID)) {
      markMediaStages();
      markFullscreenOverlays();
      recallZeroSizeText();
    }
  }, { once: true });
}

function applyClassic(settings, site, siteUsable) {
  deactivateEngine();
  armGuard(settings);
  injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));
  if (siteUsable) {
    document.documentElement.setAttribute(SITE_ATTR, site.id);
    injectStyle(SITE_STYLE_ID, compileSiteTheme(site.id));
  } else {
    removeStyle(SITE_STYLE_ID);
    document.documentElement.removeAttribute(SITE_ATTR);
  }
  markMediaStages();
  markFullscreenOverlays();
  recallZeroSizeText();
  // re-mark once the page finished loading — SPA players mount late.
  window.addEventListener('load', () => {
    if (document.getElementById(CLASSIC_STYLE_ID)) {
      markMediaStages();
      markFullscreenOverlays();
      recallZeroSizeText();
    }
  }, { once: true });
}

function whenDomReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

// Render counter: async callbacks (dom-ready, load) capture the generation
// they were scheduled in and no-op when a newer render superseded them —
// otherwise a stale callback could strip or apply against outdated settings.
let renderGeneration = 0;
// Most recent render input, kept for the post-load recheck re-render (§6).
let lastSettings = null;

function render(settings) {
  lastSettings = settings;
  const gen = ++renderGeneration;
  const rules = settings.exclusionRules ?? {};
  if (!siteDarkActive(settings, location.hostname)
      || evaluateRules(rules, collectRuleSignals(false))) {
    // Light branch leaves prior dark-pass inline styles in place (harmless);
    // a light reload starts clean — acceptable v1.
    teardown();
    return;
  }
  if (rules.darkBackground) {
    // The page's own bg luma must be measured on its native colors — the
    // classic theme flattens body to our dark (self-trigger) and invert
    // forces white (never-trigger). Hold the guard, decide at DOM ready:
    // strip → measure → re-apply runs in one synchronous task, so there is
    // no paint between teardown and the decision.
    armGuard(settings);
    whenDomReady(() => {
      if (gen !== renderGeneration) return;
      teardown();
      if (evaluateRules(rules, collectRuleSignals(true))) return; // page opts out — stays off
      applyTheme(settings);
    });
    return;
  }
  applyTheme(settings);
  // Late re-check: a dark-scheme meta may sit past the parsed head. Strip if
  // the page opts out late. (bg luma needs the delayed branch above.)
  const lateCheck = () => {
    if (gen !== renderGeneration) return;
    if ((document.getElementById(CLASSIC_STYLE_ID) || document.getElementById(VARS_STYLE_ID))
        && evaluateRules(rules, collectRuleSignals(false))) {
      teardown();
    }
  };
  whenDomReady(lateCheck);
  // Post-load recheck (§6): once the page finished loading, re-render once so
  // the exclusion evaluation runs again — late dark-scheme metas and dark
  // backgrounds get a chance to tear the effect down. Generation guard drops
  // callbacks superseded by a newer render.
  if (settings.themeId === 'adaptive' && settings.engine.recheck
      && document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      if (gen !== renderGeneration) return;
      setTimeout(() => { if (gen === renderGeneration) render(lastSettings); },
        Number(settings.engine.recheckDelay) || 0);
    }, { once: true });
  }
}

loadSettings().then(render);
subscribeSettings(render);
