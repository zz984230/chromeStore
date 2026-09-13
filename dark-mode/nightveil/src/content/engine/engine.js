// src/content/engine/engine.js
// Static engine core (M2a): activates by mounting the variable block and the
// engine output sheet, marking <html data-nv-active>, and copying rewritten
// rules from every reachable stylesheet into the engine sheet. Change
// tracking, inline styles and shadow DOM land in M2b.
import { ENGINE_VARIABLES, EXTRA_RULES_DEFAULT, engineVarsCss } from '../../shared/engineTheme.js';
import { rewriteColor, isProcessableColor } from './contract.js';
import { transformSelector, htmlPropTokens } from './selectors.js';
import { fetchRemoteCss, absolutizeUrls } from './fetchCss.js';

export const VARS_STYLE_ID = 'nv-engine-vars';
export const SHEET_STYLE_ID = 'nv-engine-sheet';
export const ACTIVE_ATTR = 'data-nv-active';
const CLONED_ATTR = 'data-nv-cloned';
const MANAGED_STYLE_IDS = new Set([VARS_STYLE_ID, SHEET_STYLE_ID, 'nv-classic', 'nv-guard', 'nv-site']);

export function buildRuleText(selector, prop, value, { priority }) {
  return `${selector} { ${prop}: ${value}${priority ? ' !important' : ''} }`;
}

const state = { sheetEl: null, varsEl: null, rulesIndex: new Map(), engine: null, varMap: {} };

function prop(rule, name) { return rule.style.getPropertyValue(name) || rule.style[name] || ''; }

function insertEngineRule(selector, prop, value, priority) {
  const css = buildRuleText(selector, prop, value, { priority });
  const key = `${selector}∣${prop}`;
  const existing = state.rulesIndex.get(selector);
  if (existing !== undefined && state.sheetEl?.sheet) {
    // same selector already rewritten → update in place when possible
    try {
      for (let i = 0; i < state.sheetEl.sheet.cssRules.length; i++) {
        if (state.sheetEl.sheet.cssRules[i].selectorText === selector) {
          state.sheetEl.sheet.cssRules[i].style.setProperty(prop, value, priority ? 'important' : '');
          state.rulesIndex.set(key, i);
          return;
        }
      }
    } catch { /* fall through to insert */ }
  }
  try {
    const index = state.sheetEl.sheet.insertRule(css, 0);
    state.rulesIndex.set(selector, index);
    state.rulesIndex.set(key, index);
  } catch { /* invalid selector — skip silently, matches original tolerance */ }
}

// A quote-bearing html attribute value can yield an invalid selector token,
// and querySelectorAll would throw — aborting the whole scan mid-sheet. Treat
// a throwing token as a nonzero count so it resolves to the plain
// space-prefixed forms, never the html-chaining branch.
const safeCount = (token) => {
  try { return document.querySelectorAll(token).length; }
  catch { return 1; }
};

function emit(rule, propName, value) {
  const selector = transformSelector(rule.selectorText, htmlPropTokens(document), safeCount);
  if (!selector) return;
  const priority = state.engine.highPriority
    || rule.style.getPropertyPriority(propName) === 'important';
  insertEngineRule(selector, propName, value, priority);
}

function rewriteStyleRule(rule) {
  const e = state.engine;
  const varMap = state.varMap;
  if (e.mapCssVariables) collectCustomProps(rule);

  if (e.darken.text) {
    const v = prop(rule, 'color');
    if (v && v !== 'var(--nv-text)' && isProcessableColor(v, 'text', e)) {
      if (v.trim() === 'transparent') emit(rule, 'font-size', '0');       // §10 quirk
      else emit(rule, 'color', rewriteColor(v, { type: 'text', engine: e, varMap, selectorText: rule.selectorText }));
    }
  }
  if (e.darken.svgFill || e.darken.svgStroke) {
    for (const [name, on] of [['fill', e.darken.svgFill], ['stroke', e.darken.svgStroke]]) {
      const v = prop(rule, name);
      if (on && v && v !== 'var(--nv-ink)' && isProcessableColor(v, 'svg', e)) {
        emit(rule, name, rewriteColor(v, { type: 'svg', engine: e, varMap, selectorText: rule.selectorText }));
      }
    }
  }
  if (e.darken.boxShadow || e.darken.textShadow) {
    for (const [name, on, varName] of [['box-shadow', e.darken.boxShadow, '--nv-shadow-box'], ['text-shadow', e.darken.textShadow, '--nv-shadow-text']]) {
      const v = prop(rule, name);
      if (on && v && v !== 'none' && !v.includes('transparent') && v !== `var(${varName})`) {
        emit(rule, name, `var(${varName})`);
      }
    }
  }
  if (e.darken.border) {
    const sides = ['', '-top', '-left', '-right', '-bottom'];
    for (const side of sides) {
      const color = prop(rule, `border${side}-color`) || (side === '' ? prop(rule, 'border') : '');
      const width = side === '' ? prop(rule, 'border-width') : prop(rule, `border${side}-width`);
      if (!color || color === 'var(--nv-edge)') continue;
      if (e.borderNeedsWidth && !width) continue;
      if (!isProcessableColor(color, 'border', e)) continue;
      emit(rule, side === '' ? 'border-color' : `border${side}-color`,
        rewriteColor(color, { type: 'border', engine: e, varMap, selectorText: rule.selectorText }));
    }
  }
  // background-color / background shorthand / background-image
  const bgColor = prop(rule, 'background-color');
  if (e.darken.background && bgColor && isProcessableColor(bgColor, 'background', e)) {
    const value = rewriteColor(bgColor, { type: 'background', engine: e, varMap, selectorText: rule.selectorText });
    if (value !== bgColor || bgColor === 'transparent') {
      emit(rule, 'background-color', value);
      if (e.backgroundBlend) emit(rule, 'background-blend-mode', 'var(--nv-blend)');
    }
  }
  const bgAll = prop(rule, 'background');
  if (e.darken.background && bgAll && isProcessableColor(bgAll, 'background', e)) {
    const value = rewriteColor(bgAll, { type: 'background', engine: e, varMap, selectorText: rule.selectorText });
    if (value !== bgAll || bgAll === 'transparent') {
      const nobc = rule.style.getPropertyValue('background-color') === '';
      const key = nobc ? 'background' : (bgAll.indexOf('-gradient(') !== -1 ? 'background' : 'background-color');
      emit(rule, key, value);
    }
  }
  const bgImage = prop(rule, 'background-image');
  if (e.darkenBackgroundImages && bgImage && bgImage !== 'none') {
    if (bgImage.indexOf('url(') !== -1 && !/-\d+x|\d+x[-_]/.test(bgImage)) {
      emit(rule, 'background-image', `linear-gradient(var(--nv-image-veil), var(--nv-image-veil)), ${bgImage}`);
      if (e.preserveBackgroundProps) {
        const repeat = prop(rule, 'background-repeat');
        const position = prop(rule, 'background-position');
        if (repeat && !(e.ignoreInitialProps && repeat === 'initial')) emit(rule, 'background-repeat', repeat);
        if (position && !(e.ignoreInitialProps && position === 'initial')) emit(rule, 'background-position', position);
      }
    } else if (bgImage.indexOf('-gradient(') !== -1 && e.removeGradients) {
      emit(rule, 'background-image', 'none');
    }
  }
}

function collectCustomProps(rule) {
  const style = rule.style;
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    if (typeof name === 'string' && name.startsWith('--') && !name.startsWith('--nv-')) {
      state.varMap[`var(${name})`] = style.getPropertyValue(name).trim();
    }
  }
}

function visitRule(rule, depth) {
  const e = state.engine;
  if (rule.href) { requestSheetFetch(rule.href, rule.parentStyleSheet?.ownerNode); return; }
  if (rule.style) { rewriteStyleRule(rule); return; }
  const type = rule.constructor.name;
  const isMedia = type === 'CSSMediaRule', isSupports = type === 'CSSSupportsRule', isKeyframes = type === 'CSSKeyframesRule';
  if (isMedia && !e.processMediaQueries) return;
  if (isSupports && !e.processSupports) return;
  if (isKeyframes && !e.processKeyframes) return;
  const deeper = isMedia || isSupports || isKeyframes ? false : e.deepRules;
  if (!rule.cssRules) return;
  for (const child of rule.cssRules) {
    if (child.style) rewriteStyleRule(child);
    else if (deeper || ((child.constructor.name === 'CSSMediaRule' && e.processMediaQueries)
      || (child.constructor.name === 'CSSSupportsRule' && e.processSupports)
      || (child.constructor.name === 'CSSKeyframesRule' && e.processKeyframes))) visitRule(child, depth + 1);
  }
}

const fetched = new Set();
async function requestSheetFetch(href, ownerNode) {
  if (fetched.has(href)) return;
  fetched.add(href);
  const content = await fetchRemoteCss(href);
  if (!content) return;
  const style = document.createElement('style');
  style.setAttribute(CLONED_ATTR, '');
  const abs = absolutizeUrls(content, href);
  style.textContent = abs;
  (ownerNode ?? document.head).appendChild(style);
  if (style.sheet) scanSheet(style.sheet);
  else requestAnimationFrame(() => style.sheet && scanSheet(style.sheet));
}

function scanSheet(sheet) {
  const owner = sheet.ownerNode;
  if (owner && MANAGED_STYLE_IDS.has(owner.id)) return;
  let rules;
  try { rules = sheet.cssRules; } catch { // cross-origin without fetch path — skip
    if (sheet.href) requestSheetFetch(sheet.href, sheet.ownerNode);
    return;
  }
  if (!rules) return;
  for (const rule of rules) visitRule(rule, 0);
}

function collectRootVarMap() {
  try {
    const map = document.documentElement.computedStyleMap?.();
    if (!map) return;
    for (const [name, value] of map) {
      if (name.startsWith('--') && !name.startsWith('--nv-')) {
        state.varMap[`var(${name})`] = value.toString().trim();
      }
    }
  } catch { /* non-Chromium or detached — rule-level map still works */ }
}

export function activateEngine(settings) {
  const engine = settings.engine;
  state.engine = engine;
  state.rulesIndex = new Map();
  state.varMap = {};
  document.documentElement.setAttribute(ACTIVE_ATTR, '');

  // re-enable clones from a previous activation cycle (original "process"
  // branch behavior) — they are re-scanned via the document.styleSheets loop
  for (const el of document.querySelectorAll(`[${CLONED_ATTR}]`)) {
    el.removeAttribute('disabled');
    if (el.sheet) el.sheet.disabled = false;
  }

  const vars = engineVarsCss({ ...ENGINE_VARIABLES, ...(engine.variables ?? {}) });
  const extra = engine.extraRules ?? EXTRA_RULES_DEFAULT;
  state.varsEl = mountStyle(VARS_STYLE_ID, `${vars}\n${extra}`);
  state.sheetEl = mountStyle(SHEET_STYLE_ID, '');

  collectRootVarMap();
  for (const sheet of document.styleSheets) scanSheet(sheet);
}

function mountStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    (document.head ?? document.documentElement).appendChild(el);
  }
  el.textContent = css;
  return el;
}

export function deactivateEngine() {
  document.documentElement?.removeAttribute(ACTIVE_ATTR);
  for (const id of [VARS_STYLE_ID, SHEET_STYLE_ID]) document.getElementById(id)?.remove();
  state.varsEl = null;
  state.sheetEl = null;
  state.rulesIndex = new Map();
  for (const el of document.querySelectorAll(`[${CLONED_ATTR}]`)) {
    el.setAttribute('disabled', '');
    if (el.sheet) el.sheet.disabled = true;
  }
}
