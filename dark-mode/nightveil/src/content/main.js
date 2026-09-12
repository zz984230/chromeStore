// src/content/main.js
// Content pipeline: read settings at document_start, inject/remove the
// classic theme, apply a flash guard while active, and re-render on changes.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, subscribeSettings } from '../shared/settings.js';
import { compileThemeById } from '../shared/themes.js';

const CLASSIC_STYLE_ID = 'nv-classic';
const GUARD_STYLE_ID = 'nv-guard';
const GUARD_REMOVE_DELAY_MS = 200;
const STAGE_ATTR = 'data-nv-stage';

console.log(STRINGS.contentActiveLog);

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
function armGuard() {
  injectStyle(GUARD_STYLE_ID, 'html { background-color: #1e2229 !important; }');
  if (guardTimer) clearTimeout(guardTimer);
  const dismiss = () => removeStyle(GUARD_STYLE_ID);
  if (document.readyState === 'complete') {
    guardTimer = setTimeout(dismiss, GUARD_REMOVE_DELAY_MS);
  } else {
    window.addEventListener('load', () => { guardTimer = setTimeout(dismiss, GUARD_REMOVE_DELAY_MS); }, { once: true });
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

// 图截文字第二式——字号归零藏字召回；风险：依赖 fs:0 隐藏回退文字的真图标旁可能出现双渲染（backlog 已记）。
function recallZeroSizeText() {
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length !== 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.fontSize !== '0px') continue;
    // 从最近非零字号祖先取回字号，兜底 12px
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

function render(settings) {
  const active = settings.state === 'dark';
  if (active) {
    armGuard();
    injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));
    markMediaStages();
    recallZeroSizeText();
    // re-mark once the page finished loading — SPA players mount late;
    // videos added after load still wait for the next render.
    window.addEventListener('load', () => {
      if (document.getElementById(CLASSIC_STYLE_ID)) {
        markMediaStages();
        recallZeroSizeText();
      }
    }, { once: true });
  } else {
    // Light branch leaves prior dark-pass inline styles in place (harmless);
    // a light reload starts clean — acceptable v1.
    removeStyle(CLASSIC_STYLE_ID);
    removeStyle(GUARD_STYLE_ID);
    clearVideoStages();
  }
}

loadSettings().then(render);
subscribeSettings(render);
