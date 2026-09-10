// src/content/main.js
// Content pipeline: read settings at document_start, inject/remove the
// classic theme, apply a flash guard while active, and re-render on changes.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, subscribeSettings } from '../shared/settings.js';
import { compileThemeById } from '../shared/themes.js';

const CLASSIC_STYLE_ID = 'nv-classic';
const GUARD_STYLE_ID = 'nv-guard';
const GUARD_REMOVE_DELAY_MS = 200;

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

function render(settings) {
  const active = settings.state === 'dark';
  if (active) {
    armGuard();
    injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));
  } else {
    removeStyle(CLASSIC_STYLE_ID);
    removeStyle(GUARD_STYLE_ID);
  }
}

loadSettings().then(render);
subscribeSettings(render);
