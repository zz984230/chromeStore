// tests/unit/engine-conditioned-rescan.test.mjs
// M2c final-review Fix 1: the conditioned update-in-place scan must descend
// nested grouping rules. The conditioned map stores the OUTERMOST wrapper, so
// under @media > @supports the style rule hides in a CSSSupportsRule (no
// selectorText) — a one-level scan misses it and every rescan inserts another
// wrapped copy (unbounded growth; d.1+d.3 both on). Pins the pure
// findConditionedRule lookup plus a fake-sheet rescan through the real
// engineProcessShadowRoots path (engine-shadow.test.mjs is the model).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findConditionedRule, activateEngine, deactivateEngine, engineProcessShadowRoots }
  from '../../src/content/engine/engine.js';
import { engineDefaults } from '../../src/content/engine/contract.js';

test('findConditionedRule matches the top-level style rule', () => {
  const rule = { selectorText: '.card', style: {} };
  assert.equal(findConditionedRule([rule], '.card'), rule);
});

test('findConditionedRule descends grouping rules without selectorText', () => {
  // @media > @supports > .card: the outer scopes carry no selectorText
  const card = { selectorText: '.card', style: {} };
  const supports = { conditionText: '(display: grid)', cssRules: [card] };
  const media = { conditionText: '(max-width: 600px)', cssRules: [supports] };
  assert.equal(findConditionedRule([media], '.card'), card);
  assert.equal(findConditionedRule([supports], '.card'), card);
});

test('findConditionedRule returns undefined when the selector is truly absent', () => {
  const media = { conditionText: '(max-width: 600px)', cssRules: [] };
  assert.equal(findConditionedRule([media], '.card'), undefined);
  assert.equal(findConditionedRule([], '.card'), undefined);
  assert.equal(findConditionedRule(undefined, '.card'), undefined);
});

// ---- full fake: a sheet whose insertRule records and rebuilds the nested
// @media > @supports structure, driven through the real shadow emit path ----

// Rebuild enough CSSOM shape for the update-in-place scan: a wrapped block
// nests recursively; a plain rule carries selectorText and records setProperty
// calls into the sheet-level `sink` so assertions read one list per target.
function parseRule(css, sink) {
  const at = css.match(/^@(media|supports)\s+([^{]+?)\s*\{/);
  if (at) {
    const inner = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}')).trim();
    return { conditionText: at[2].trim(), cssRules: [parseRule(inner, sink)] };
  }
  const brace = css.indexOf('{');
  return {
    selectorText: css.slice(0, brace).trim(),
    style: { setProperty: (p, v) => sink.push(`${p}:${v}`) },
  };
}

class NestedFakeSheet {
  constructor() {
    this.cssRules = [];
    this.inserted = [];
    this.updates = [];
    this.disabled = false;
  }

  insertRule(css) {
    this.inserted.push(css);
    this.cssRules.unshift(parseRule(css, this.updates));
    return 0;
  }

  deleteRule() { this.cssRules.shift(); }
}

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

// One open shadow root whose source sheet wraps .card in @media > @supports —
// the double-condition case (d.1+d.3) the one-level scan mishandled.
function makeShadowDom() {
  const byId = new Map();
  const srcSheet = {
    ownerNode: null,
    cssRules: [{
      constructor: { name: 'CSSMediaRule' },
      conditionText: '(max-width: 600px)',
      cssRules: [{
        constructor: { name: 'CSSSupportsRule' },
        conditionText: '(display: grid)',
        cssRules: [{
          constructor: { name: 'CSSStyleRule' },
          selectorText: '.card',
          style: {
            length: 1,
            0: 'color',
            getPropertyValue: (k) => (k === 'color' ? '#ffffff' : ''),
            getPropertyPriority: () => '',
          },
        }],
      }],
    }],
  };
  const sr = { styleSheets: [srcSheet], adoptedStyleSheets: [], querySelectorAll: () => [] };
  const host = {
    localName: 'div',
    shadowRoot: sr,
    isConnected: true,
    hasAttribute: () => false,
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
  };
  return {
    doc: {
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
        sheet: {
          cssRules: [],
          insertRule() { this.cssRules.unshift({ selectorText: '', style: { setProperty() {} } }); return 0; },
        },
      }),
      querySelector: () => null,
      querySelectorAll: (sel) => (sel === '*' ? [host] : []),
    },
    sr,
  };
}

test('rescan under nested @media > @supports updates in place, never duplicates', (t) => {
  const prev = [globalThis.document, globalThis.MutationObserver, globalThis.CSSStyleSheet];
  const { doc, sr } = makeShadowDom();
  globalThis.document = doc;
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.CSSStyleSheet = NestedFakeSheet;
  t.after(() => {
    [globalThis.document, globalThis.MutationObserver, globalThis.CSSStyleSheet] = prev;
  });

  activateEngine({ engine: {
    ...engineDefaults(), processMediaQueries: true, processSupports: true,
  } });
  engineProcessShadowRoots(); // shadow scan is driven directly (shadow flag off → no hook injection)

  const sheet = sr.adoptedStyleSheets[0];
  const expected = '@media (max-width: 600px) { @supports (display: grid) { .card { color: var(--nv-text) } } }';
  assert.equal(sheet.inserted.length, 1, 'the double-wrapped block inserted once');
  assert.equal(sheet.inserted[0], expected);

  engineProcessShadowRoots(); // the rescan that used to pile on a second copy
  assert.equal(sheet.inserted.length, 1, 'rescan must not insert a duplicate wrapped copy');
  assert.deepEqual(sheet.updates, ['color:var(--nv-text)'],
    'rescan rewrote the nested rule in place');

  deactivateEngine();
  assert.equal(sheet.cssRules.length, 0, 'deactivate clears the shadow sheet');
});
