// tests/unit/engine-lifecycle.test.mjs
// Activation lifecycle contracts (M2b final review, Fix 1 regression pins).
// Node has no DOM, but engine.js only touches document/MutationObserver
// inside functions — never at import time — so the module-level state machine
// is driven through its PUBLIC API (activateEngine/deactivateEngine) against
// minimal jsdom-free stubs of globalThis.document and globalThis.MutationObserver.
//
// state.styleMO itself is module-private, so "no style-MO handle" is pinned
// via the observable contract: the stale observer gets disconnect()ed exactly
// once and no replacement is observe()d — the leak the reset closes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activateEngine, deactivateEngine, SHEET_STYLE_ID } from '../../src/content/engine/engine.js';
import { engineDefaults } from '../../src/content/engine/contract.js';

// ---- jsdom-free stubs ------------------------------------------------------

// MutationObserver double: records instances so tests can pin observe/disconnect.
const moInstances = [];
class FakeMutationObserver {
  constructor(cb) {
    this.cb = cb;
    this.observedOptions = null;
    this.observeCount = 0;
    this.disconnectCount = 0;
    moInstances.push(this);
  }
  observe(_target, options) { this.observeCount++; this.observedOptions = options; }
  disconnect() { this.disconnectCount++; }
}

// Inline node shaped like the real thing: style iterates via length/index,
// classList tokens persist across activations (the node keeps its nv-inline-*).
function makeInlineNode() {
  const tokens = new Set();
  return {
    localName: 'div',
    style: { length: 1, 0: 'color', getPropertyValue: (k) => (k === 'color' ? '#ffffff' : '') },
    classList: { contains: (c) => tokens.has(c), add: (c) => tokens.add(c) },
  };
}

// Document stub covering exactly what activateEngine touches: root attr, the
// cloned-style sweep, mountStyle's getElementById/createElement/head, the
// rescan's styleSheets + [style] query, and htmlPropTokens' iteration.
function makeStubDom(inlineNode) {
  const byId = new Map();
  const insertCalls = [];
  const doc = {
    documentElement: {
      id: '',
      classList: [],
      attributes: [],
      setAttribute() {},
      removeAttribute() {},
      getAttribute: () => null,
    },
    head: { appendChild(el) { if (el.id) byId.set(el.id, el); } },
    body: null,
    readyState: 'complete',
    styleSheets: [],
    getElementById: (id) => byId.get(id) ?? null,
    createElement: () => ({
      id: '',
      textContent: '',
      remove() { for (const [id, el] of byId) if (el === this) byId.delete(id); },
      // CSSOM stand-in: insertRule records so inline re-emission is observable.
      sheet: {
        cssRules: [],
        insertRule(css) {
          insertCalls.push(css);
          this.cssRules.unshift({
            selectorText: css.slice(0, css.indexOf('{')).trim(),
            style: { setProperty() {} },
          });
          return 0;
        },
      },
    }),
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '[style]' ? [inlineNode] : []),
  };
  return { doc, byId, insertCalls };
}

function installGlobals(t, doc) {
  const prevDoc = globalThis.document;
  const prevMO = globalThis.MutationObserver;
  globalThis.document = doc;
  globalThis.MutationObserver = FakeMutationObserver;
  t.after(() => {
    globalThis.document = prevDoc;
    globalThis.MutationObserver = prevMO;
    moInstances.length = 0;
  });
}

const INLINE_ON = () => ({ engine: { ...engineDefaults(), processInlineStyles: true } });
const styleMOs = () => moInstances.filter((mo) => mo.observedOptions?.attributeFilter?.[0] === 'style');
const inlineRules = (insertCalls) => insertCalls.filter((css) => css.includes('nv-inline-'));

// ---- Fix 1 regression pins -------------------------------------------------

test('re-activation with the SAME settings re-runs the inline sweep (§6 recheck re-render)', (t) => {
  const node = makeInlineNode();
  const { doc, byId, insertCalls } = makeStubDom(node);
  installGlobals(t, doc);
  const settings = INLINE_ON();

  activateEngine(settings);
  assert.equal(inlineRules(insertCalls).length, 1, 'first activation emits the inline rule');
  assert.equal(byId.get(SHEET_STYLE_ID).textContent, '', 'engine sheet mounts empty (CSSOM carries the rules)');

  // The bug path: engine→engine re-render with NO deactivate in between.
  // Before the reset, mountStyle wiped the sheet but inlineProcessed survived,
  // so the rescan skipped the node and the inline rule stayed gone.
  activateEngine(settings);
  const rules = inlineRules(insertCalls);
  assert.equal(rules.length, 2, 'inline rule is re-emitted after re-activation');
  assert.equal(rules[1], rules[0], 'same selector — the node reuses its nv-inline-* class, no pile-up');
  deactivateEngine();
  assert.equal(inlineRules(insertCalls).length, 2, 'deactivate does not resurrect rules');
});

test('re-activation with processInlineStyles:false detaches the stale style-MO and mounts none', (t) => {
  const node = makeInlineNode();
  const { doc, insertCalls } = makeStubDom(node);
  installGlobals(t, doc);

  activateEngine(INLINE_ON());
  assert.equal(styleMOs().length, 1, 'style-MO attached while the flag is on');

  // Flag flipped between renders (settings change path): the old handle must
  // be disconnected (module state nulled → observable as disconnect) and no
  // replacement observer created. Without the reset it would stay connected.
  activateEngine({ engine: { ...engineDefaults(), processInlineStyles: false } });
  assert.equal(styleMOs()[0].disconnectCount, 1, 'stale style-MO handle disconnected');
  assert.equal(styleMOs().length, 1, 'no new style-MO mounted while the flag is off');
  assert.equal(inlineRules(insertCalls).length, 1, 'no further inline sweep without the flag');
  deactivateEngine();
});

test('re-activation keeps element-MO count at one per activation (always-on observer re-attached)', (t) => {
  const node = makeInlineNode();
  const { doc } = makeStubDom(node);
  installGlobals(t, doc);

  activateEngine(INLINE_ON());
  activateEngine(INLINE_ON());
  const elementMOs = moInstances.filter((mo) => mo.observedOptions?.subtree === true
    && mo.observedOptions?.attributeFilter === undefined);
  assert.equal(elementMOs.length, 2, 'one fresh element-MO per activation');
  assert.equal(elementMOs[0].disconnectCount, 1, 'previous element-MO detached, not leaked');
  deactivateEngine();
});

// ---- M3 documentRoot + reattachStyles (plan Task 5; M3-BEHAVIOR §5) --------

// Document stub for the mount-parent/reattach pins: same jsdom-free shape as
// makeStubDom, but the caller supplies the head/documentElement nodes (their
// appendChild records where the mount landed). The factory wraps each
// appendChild to keep the getElementById registry in sync and mark the node
// connected — mirroring how a real appendChild makes a node reachable.
function makeDocumentStub({ head, root }) {
  const byId = new Map();
  for (const parent of [head, root]) {
    const record = parent.appendChild;
    parent.appendChild = (node) => {
      byId.set(node.id, node);
      node.isConnected = true;
      return record(node);
    };
  }
  root.classList ??= []; // htmlPropTokens iterates these on every rescan pass
  root.attributes ??= [];
  return {
    documentElement: root,
    head,
    body: null,
    readyState: 'complete',
    styleSheets: [],
    getElementById: (id) => byId.get(id) ?? null,
    createElement: () => ({
      id: '',
      textContent: '',
      isConnected: false,
      remove() { for (const [id, el] of byId) if (el === this) byId.delete(id); },
      sheet: { cssRules: [], insertRule() { return 0; } },
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

test('documentRoot true mounts engine styles on documentElement, not head (§5.2)', async (t) => {
  const { activateEngine, deactivateEngine, VARS_STYLE_ID } = await import('../../src/content/engine/engine.js');
  const { engineDefaults } = await import('../../src/content/engine/contract.js');
  const appended = [];
  const head = { appendChild: (n) => appended.push(['head', n.id]) };
  const root = { appendChild: (n) => appended.push(['root', n.id]), style: { setProperty() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {} };
  installGlobals(t, makeDocumentStub({ head, root }));
  const settings = { documentRoot: true, reattachStyles: true, engine: engineDefaults() };
  activateEngine(settings, {});
  assert.ok(appended.some(([where, id]) => where === 'root' && id === VARS_STYLE_ID),
    'vars 元素应挂 documentElement');
  deactivateEngine();
});

test('engineRescanAll re-attaches a detached sheet element when reattachStyles on (§5.3)', async (t) => {
  const { activateEngine, deactivateEngine, engineRescanAll, SHEET_STYLE_ID } = await import('../../src/content/engine/engine.js');
  const { engineDefaults } = await import('../../src/content/engine/contract.js');
  const appended = [];
  const head = { appendChild: (n) => appended.push(n.id) };
  const root = { appendChild: (n) => appended.push(n.id), style: { setProperty() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {} };
  installGlobals(t, makeDocumentStub({ head, root }));
  activateEngine({ documentRoot: false, reattachStyles: true, engine: engineDefaults() }, {});
  appended.length = 0;
  // 模拟站点脚本删掉引擎表元素：元素对象仍在（sheet 句柄不丢），但脱离 DOM。
  const el = globalThis.document.getElementById(SHEET_STYLE_ID);
  el.isConnected = false;
  engineRescanAll();
  assert.ok(appended.includes(SHEET_STYLE_ID), '重扫应把脱离的引擎表元素重挂（documentElement）');
  deactivateEngine();
});

test('reattachStyles off leaves detached elements alone until the next render (§5.3)', async (t) => {
  const { activateEngine, deactivateEngine, engineRescanAll, SHEET_STYLE_ID } = await import('../../src/content/engine/engine.js');
  const { engineDefaults } = await import('../../src/content/engine/contract.js');
  const appended = [];
  const head = { appendChild: (n) => appended.push(n.id) };
  const root = { appendChild: (n) => appended.push(n.id), style: { setProperty() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {} };
  installGlobals(t, makeDocumentStub({ head, root }));
  activateEngine({ documentRoot: false, reattachStyles: false, engine: engineDefaults() }, {});
  appended.length = 0;
  const el = globalThis.document.getElementById(SHEET_STYLE_ID);
  el.isConnected = false;
  engineRescanAll();
  assert.equal(appended.length, 0, '关闭时重扫不得重挂');
  deactivateEngine();
});
