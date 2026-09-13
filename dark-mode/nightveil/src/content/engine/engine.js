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
  styleMO: null, // style-attribute observer, only while processInlineStyles is on
  classMO: null, // class-attribute observer, only while watchClassChanges is on
  poShort: null, // paint/layout-shift observer, only while tuning is page-load
  poLong: null, // longtask observer, only when the entry type is supported
};

// Inline style rewrite bookkeeping (§0-⑧). inlineClassCache remembers which
// nv-inline-* class a node carries so a later pass reuses it instead of
// piling on classes; it survives deactivation (nodes keep their class).
// inlineProcessed maps class → props already emitted for it, so rescans
// (rescanAll, style-MO) don't duplicate rules; it resets on deactivate.
const inlineClassCache = new WeakMap();
const inlineProcessed = new Map();
const pendingInline = new Set(); // style-changed nodes awaiting the 'inline' flush
// Inline rules are always important (§0-⑧): the rewrite core emits
// (selector, prop, value) and this wrapper pins the priority.
const insertInlineRule = (selector, prop, value) => insertEngineRule(selector, prop, value, true);

// Nodes awaiting the coalesced 'node' flush: the scheduler keeps only the
// latest closure per key, so a batch of link/style insertions accumulates here
// and the single flushed fn processes every node in the batch.
const pendingSheets = new Set();

// i.2 continuous processing: id/class keys of post-load elements already
// routed to a 'new-el' rescan, so the same element never retriggers one.
// Resets with the activation that populated it.
const seenNodeKeys = new Set();

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

// Class-MO self-feedback filter (i.1): our own writes only ever add or remove
// nv-* tokens (nv-inline-* random classes, clone marking), so a mutation whose
// non-nv token set is unchanged is ours — false keeps 'class-rescan' quiet.
// An unreadable old/new value cannot prove the change was ours → true.
export function isForeignClassMutation(oldValue, newValue) {
  const foreign = (v) => new Set(
    (v ?? '').split(/\s+/).filter((t) => t && !t.startsWith('nv-')));
  const before = foreign(oldValue);
  const after = foreign(newValue);
  if (before.size !== after.size) return true;
  for (const t of before) if (!after.has(t)) return true;
  return false;
}

// i.2 dedup key: the id when present, else the full className string when it
// carries at least one non-nv- token; null when the element gives nothing
// watchable (also covers SVG, whose className is not a string).
export function newElementKey(node) {
  const id = node.id ?? '';
  if (id) return id;
  const cls = typeof node.className === 'string' ? node.className : '';
  return cls.split(/\s+/).some((t) => t && !t.startsWith('nv-')) ? cls : null;
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

// Full reentrant scan: refresh context, then rescan every reachable sheet —
// plus, while processInlineStyles (f) is on, every [style] element.
export function engineRescanAll() {
  engineRefreshContext();
  for (const sheet of document.styleSheets) scanSheet(sheet);
  if (state.engine?.processInlineStyles === true) {
    for (const el of document.querySelectorAll('[style]')) {
      rewriteInlineNode(el, state.engine, state.varMap, insertInlineRule);
    }
  }
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
  const observers = decideObservers(engine);
  if (observers.elementMO) attachElementObserver();
  if (observers.styleMO) attachStyleObserver();
  if (observers.classMO) attachClassObserver();
  if (observers.poShort) attachPerformanceObservers();
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
    pendingSheets.add(node);
    state.sched.schedule('node', () => {
      const nodes = [...pendingSheets];
      pendingSheets.clear();
      for (const n of nodes) engineProcessSheetOf(n);
    });
    if (engine.tuning === 'performance') state.sched.schedule('ctx', engineRefreshContext);
  } else if (name === 'iframe' || name === 'script') {
    if (engine.tuning === 'performance') state.sched.schedule('rescan', engineRescanAll);
  } else if (decideObservers(engine).continueWatch && document.readyState === 'complete') {
    // i.2 continuous processing: post-load elements carrying a watchable
    // id/class trigger one rescan per key (deduped via seenNodeKeys).
    const key = newElementKey(node);
    if (key && !seenNodeKeys.has(key)) {
      seenNodeKeys.add(key);
      state.sched.schedule('new-el', engineRescanAll);
    }
  }
}

// ---- inline styles (f, §0-⑧): five props, random class, always important ----

export const INLINE_PROPS = ['color', 'border-color', 'background', 'background-color', 'background-image'];

export function randInlineClass() {
  return 'nv-inline-' + Math.floor(Math.random() * 1e7);
}

// Existing nv-inline-* class of the node when we can confirm it still applies,
// else generate one and add it (idempotent — never two classes per node).
export function inlineClassFor(node) {
  const known = inlineClassCache.get(node);
  if (known && node.classList?.contains(known)) return known;
  const cls = randInlineClass();
  node.classList?.add?.(cls);
  inlineClassCache.set(node, cls);
  return cls;
}

const INLINE_TYPE = { color: 'text', 'border-color': 'border', background: 'background', 'background-color': 'background' };
const INLINE_TARGET_VAR = { text: 'var(--nv-text)', border: 'var(--nv-edge)', background: 'var(--nv-surface)' };

// Value-level branch of one inline declaration — mirrors the rewriteStyleRule
// branches scoped to the five inline props; returns the emitted value or null
// when the declaration must not produce a rule. selectorText is the node's
// plain tag name so rewriteColor sees html/body inline styles as root targets
// (rootSpecial fallback), same as the sheet path does for html/body rules.
function rewriteInlineProp(key, value, engine, varMap, style, selectorText) {
  if (key === 'background-image') {
    if (!engine.darkenBackgroundImages || value === 'none') return null;
    if (value.indexOf('url(') !== -1 && !/-\d+x|\d+x[-_]/.test(value)) {
      return `linear-gradient(var(--nv-image-veil), var(--nv-image-veil)), ${value}`;
    }
    if (value.indexOf('-gradient(') !== -1 && engine.removeGradients) return 'none';
    return null;
  }
  const type = INLINE_TYPE[key];
  if (!type) return null;
  const on = type === 'text' ? engine.darken.text : type === 'border' ? engine.darken.border : engine.darken.background;
  if (!on) return null;
  // transparent text feeds the font-size quirk on the sheet path, which is not
  // one of the five inline props — nothing safe to emit here
  if (type === 'text' && value === 'transparent') return null;
  if (value === INLINE_TARGET_VAR[type]) return null;
  if (engine.borderNeedsWidth && type === 'border' && !style.getPropertyValue('border-width')) return null;
  if (!isProcessableColor(value, type, engine)) return null;
  const next = rewriteColor(value, { type, engine, varMap, selectorText });
  return next === value ? null : next; // preserveDarkColors etc. → no-op rule skipped
}

// A color-only background shorthand narrows to background-color when the node
// also declares background-color separately, so the shorthand's other layers
// survive — same emit-key choice as the sheet path.
function inlineEmitKey(key, value, style) {
  if (key !== 'background') return key;
  if (value.indexOf('-gradient(') !== -1 || style.getPropertyValue('background-color') === '') return 'background';
  return 'background-color';
}

export function rewriteInlineNode(node, engine, varMap, insertFn) {
  const style = node.style;
  if (!style) return;
  const cls = inlineClassFor(node);
  const selector = `html[${ACTIVE_ATTR}] .${cls}`;
  const rootSelector = node.localName || ''; // rewriteColor root-target signal (html/body)
  const seen = inlineProcessed.get(cls) ?? new Set();
  inlineProcessed.set(cls, seen);
  for (let i = 0; i < style.length; i++) {
    const key = style[i];
    if (typeof key !== 'string' || seen.has(key)) continue;
    const value = (style.getPropertyValue(key) || '').trim();
    if (!value) continue;
    if (key.startsWith('--')) {
      // custom props are varMap inputs, not rules — re-collected on every pass
      // because engineRefreshContext resets the map between scan passes
      if (!key.startsWith('--nv-')) varMap[`var(${key})`] = value;
      continue;
    }
    const out = rewriteInlineProp(key, value, engine, varMap, style, rootSelector);
    if (out === null) continue;
    seen.add(key);
    insertFn(selector, inlineEmitKey(key, value, style), out);
  }
}

// style-attribute observer (f): a changed style value carrying a color-ish
// token reschedules the node's inline rewrite under the coalescing 'inline'
// key; the pending set drains the whole batch (same-key coalescing keeps only
// the latest closure, so nodes must not ride inside the closure — c40d345).
function attachStyleObserver() {
  state.styleMO?.disconnect();
  state.styleMO = new MutationObserver((records) => {
    if (!state.engine) return; // microtask delivered after teardown
    for (const m of records) {
      const val = m.target.getAttribute?.('style') ?? '';
      if (!val.includes('--') && !val.includes('color:') && !val.includes('background')) continue;
      pendingInline.add(m.target);
      state.sched.schedule('inline', () => {
        const nodes = [...pendingInline];
        pendingInline.clear();
        for (const n of nodes) {
          if (!state.engine) return;
          rewriteInlineNode(n, state.engine, state.varMap, insertInlineRule);
        }
      });
    }
  });
  state.styleMO.observe(document.documentElement, { attributeFilter: ['style'], subtree: true });
}

// class watcher (i.1, watchClassChanges): any foreign class change anywhere in
// the document reschedules a full rescan; nv-only deltas are our own writes
// and are swallowed by the self-feedback filter.
function attachClassObserver() {
  state.classMO?.disconnect();
  state.classMO = new MutationObserver((records) => {
    if (!state.engine) return; // microtask delivered after teardown
    for (const m of records) {
      const now = m.target.getAttribute?.('class') ?? null;
      if (isForeignClassMutation(m.oldValue, now)) {
        state.sched.schedule('class-rescan', engineRescanAll);
        return; // coalesced — one foreign delta per batch is enough
      }
    }
  });
  // attributeOldValue feeds isForeignClassMutation's old/new comparison
  state.classMO.observe(document.documentElement,
    { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
}

// PerformanceObserver wiring (m.1 + m.3), assembled only for the page-load
// tuning (decideObservers poShort/poLong). Older targets may throw on unknown
// entryTypes — each construction is guarded and a failure silently skips that
// observer, matching the engine's silent-tolerance pattern.
function attachPerformanceObservers() {
  state.poShort?.disconnect();
  state.poLong?.disconnect();
  try {
    state.poShort = new PerformanceObserver(() => {
      if (!state.engine) return; // delivered after teardown
      state.sched.schedule('po-short', engineRescanAll); // refreshes context first
    });
    state.poShort.observe({ entryTypes: ['paint', 'layout-shift'] });
  } catch { state.poShort = null; }
  try {
    if (window.PerformanceLongTaskTiming === undefined) return;
    state.poLong = new PerformanceObserver(() => {
      if (!state.engine) return;
      // hidden-tab longtasks only: repaint after the fact is wasted work
      if (document.visibilityState === 'hidden') {
        state.sched.schedule('po-long', engineRescanAll, 300);
      }
    });
    state.poLong.observe({ entryTypes: ['longtask'] });
  } catch { state.poLong = null; }
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
  state.styleMO?.disconnect();
  state.styleMO = null;
  state.classMO?.disconnect();
  state.classMO = null;
  state.poShort?.disconnect();
  state.poShort = null;
  state.poLong?.disconnect();
  state.poLong = null;
  state.sched?.cancelAll();
  state.sched = null;
  pendingSheets.clear();
  pendingInline.clear();
  seenNodeKeys.clear();
  // nv-inline-* classes stay on their nodes — inert without the engine sheet
  // (M1 light-branch precedent); only the processed-props bookkeeping resets.
  inlineProcessed.clear();
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
