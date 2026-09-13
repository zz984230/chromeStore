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

const state = {
  sheetEl: null,
  varsEl: null,
  writtenSelectors: new Set(), // selectors already present in the engine sheet
  engine: null,
  varMap: {},
  htmlProps: [], // htmlPropTokens snapshot, recomputed once per scan pass
  onFirstRule: null, // first-rule hook of the current activation, nulled once fired
  sched: null, // per-activation debounce scheduler (coalesces observer triggers)
  elementMO: null, // always-on documentElement childList/subtree observer
};

// Debounce scheduler: same-key schedules coalesce (only the latest fn runs),
// different keys run independently. Timer impls are injectable for tests.
export function createScheduler(setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout) {
  const pending = new Map();
  return {
    schedule(key, fn, delay = 0) {
      const prev = pending.get(key);
      if (prev !== undefined) clearTimeoutImpl(prev);
      const id = setTimeoutImpl(() => {
        pending.delete(key);
        fn();
      }, delay);
      pending.set(key, id);
    },
    cancel(key) {
      const id = pending.get(key);
      if (id === undefined) return;
      clearTimeoutImpl(id);
      pending.delete(key);
    },
    cancelAll() {
      for (const id of pending.values()) clearTimeoutImpl(id);
      pending.clear();
    },
  };
}

// Pure derivation of which observers/triggers an active engine needs.
// elementMO is always on while active; runtime capability checks (e.g.
// PerformanceLongTaskTiming for poLong) happen at assembly, not here.
export function decideObservers(engine) {
  const po = engine.performanceObserver === true && engine.tuning === 'page-load';
  return {
    elementMO: true,
    styleMO: engine.processInlineStyles === true,
    classMO: engine.watchClassChanges === true,
    poShort: po,
    poLong: po,
    continueWatch: engine.watchNewElements === true,
  };
}

function prop(rule, name) { return rule.style.getPropertyValue(name) || rule.style[name] || ''; }

function insertEngineRule(selector, prop, value, priority) {
  const css = buildRuleText(selector, prop, value, { priority });
  if (state.writtenSelectors.has(selector) && state.sheetEl?.sheet) {
    // same selector already rewritten → update in place when possible
    try {
      for (let i = 0; i < state.sheetEl.sheet.cssRules.length; i++) {
        if (state.sheetEl.sheet.cssRules[i].selectorText === selector) {
          state.sheetEl.sheet.cssRules[i].style.setProperty(prop, value, priority ? 'important' : '');
          return;
        }
      }
    } catch { /* fall through to insert */ }
  }
  try {
    state.sheetEl.sheet.insertRule(css, 0);
  } catch { return; /* invalid selector — skip silently, matches original tolerance */ }
  state.writtenSelectors.add(selector);
  if (state.onFirstRule) {
    const cb = state.onFirstRule;
    state.onFirstRule = null;
    cb();
  }
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
  const selector = transformSelector(rule.selectorText, state.htmlProps, safeCount);
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

function visitRule(rule) {
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
      || (child.constructor.name === 'CSSKeyframesRule' && e.processKeyframes))) visitRule(child);
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
  if (!state.engine) return; // async callbacks (fetched-sheet rAF) may fire after deactivation
  const owner = sheet.ownerNode;
  if (owner && MANAGED_STYLE_IDS.has(owner.id)) return;
  let rules;
  try { rules = sheet.cssRules; } catch { // cross-origin without fetch path — skip
    if (sheet.href) requestSheetFetch(sheet.href, sheet.ownerNode);
    return;
  }
  if (!rules) return;
  for (const rule of rules) visitRule(rule);
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

// Rebuild the per-pass context snapshot: fresh varMap and one htmlPropTokens
// computation for the whole scan pass (emit reads the snapshot).
export function engineRefreshContext() {
  state.varMap = {};
  collectRootVarMap();
  state.htmlProps = htmlPropTokens(document);
}

// Full reentrant scan: refresh context, then rescan every reachable sheet.
export function engineRescanAll() {
  engineRefreshContext();
  for (const sheet of document.styleSheets) scanSheet(sheet);
}

// Incremental entry point for a newly added link/style node, including the
// cross-origin fetch path when the node has no readable sheet yet.
export function engineProcessSheetOf(node) {
  if (!node) return;
  if (node.sheet) { scanSheet(node.sheet); return; }
  if (node.href) requestSheetFetch(node.href, node);
}

export function activateEngine(settings, { onFirstRule } = {}) {
  const engine = settings.engine;
  state.engine = engine;
  state.writtenSelectors = new Set();
  state.onFirstRule = onFirstRule ?? null;
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

  engineRescanAll();
  if (decideObservers(engine).elementMO) attachElementObserver();
}

// Always-on element observer: any added element node routes to its trigger
// through the scheduler's coalescing keys.
function attachElementObserver() {
  state.elementMO?.disconnect(); // idempotent re-activation guard
  state.sched?.cancelAll();
  state.sched = createScheduler();
  state.elementMO = new MutationObserver((records) => {
    if (!state.engine) return; // microtask delivered after teardown
    for (const m of records) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue; // element nodes only
        handleAddedElement(node);
      }
    }
  });
  state.elementMO.observe(document.documentElement, { childList: true, subtree: true });
}

function handleAddedElement(node) {
  const engine = state.engine;
  const name = node.localName;
  if (name === 'link' || name === 'style') {
    state.sched.schedule('node', () => engineProcessSheetOf(node));
    if (engine.tuning === 'performance') state.sched.schedule('ctx', engineRefreshContext);
  } else if (name === 'iframe' || name === 'script') {
    if (engine.tuning === 'performance') state.sched.schedule('rescan', engineRescanAll);
  }
  // other tags: no trigger yet (class/style-attr watching lands in M2b Task 4/5)
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
  state.elementMO?.disconnect();
  state.elementMO = null;
  state.sched?.cancelAll();
  state.sched = null;
  document.documentElement?.removeAttribute(ACTIVE_ATTR);
  for (const id of [VARS_STYLE_ID, SHEET_STYLE_ID]) document.getElementById(id)?.remove();
  state.varsEl = null;
  state.sheetEl = null;
  state.engine = null;
  state.writtenSelectors = new Set();
  state.varMap = {};
  state.htmlProps = [];
  state.onFirstRule = null;
  for (const el of document.querySelectorAll(`[${CLONED_ATTR}]`)) {
    el.setAttribute('disabled', '');
    if (el.sheet) el.sheet.disabled = true;
  }
}
