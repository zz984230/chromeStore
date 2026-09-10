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

// Mark the wrapper layers directly around <video> so overlay flattening keeps
// them transparent (otherwise originally-transparent player layers — danmaku,
// subtitles, controls — paint opaque over the video). Known v1 limitation:
// videos added later by an SPA are only marked on the next render.
function markVideoStages() {
  clearVideoStages();
  for (const v of document.querySelectorAll('video')) {
    const vw = v.getBoundingClientRect().width || 1;
    let el = v.parentElement;
    for (let i = 0; i < 8 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect();
      if (r.width > vw * 1.5) break;
      el.setAttribute(STAGE_ATTR, '');
      el = el.parentElement;
    }
  }
}

function render(settings) {
  const active = settings.state === 'dark';
  if (active) {
    armGuard();
    injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));
    markVideoStages();
    // re-mark once the page finished loading — SPA players mount late;
    // videos added after load still wait for the next render.
    window.addEventListener('load', () => {
      if (document.getElementById(CLASSIC_STYLE_ID)) markVideoStages();
    }, { once: true });
  } else {
    removeStyle(CLASSIC_STYLE_ID);
    removeStyle(GUARD_STYLE_ID);
    clearVideoStages();
  }
}

loadSettings().then(render);
subscribeSettings(render);
