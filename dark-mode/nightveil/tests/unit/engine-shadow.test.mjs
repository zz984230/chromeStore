// tests/unit/engine-shadow.test.mjs
// Shadow DOM penetration pure parts (M2b Task 7, §5): the main-world hook
// script is asserted as source text (it runs in the page's main world, outside
// the node test runtime — no execution), plus the engine's shadow key wiring.
// DOM assembly (engineProcessShadowRoots walks, sheet adoption, deactivate
// disable) is verified via heavy.html in Task 8.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHADOW_HOST_ATTR, decideObservers, activateEngine, deactivateEngine, engineProcessShadowRoots }
  from '../../src/content/engine/engine.js';
import { engineDefaults } from '../../src/content/engine/contract.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hook = readFileSync(join(ROOT, 'public', 'nv-shadow-hook.js'), 'utf8');

test('hook: proxies Element.prototype.attachShadow and calls the original', () => {
  assert.match(hook, /Element\.prototype\.attachShadow\s*=/);
  assert.match(hook, /Reflect\.apply\(/);
});

test('hook: forces init.mode = \'open\' so the engine can reach shadowRoot', () => {
  assert.match(hook, /init\.mode\s*=\s*'open'/);
});

test('hook: posts the nv-shadow-attach message literal on first marking', () => {
  assert.match(hook, /postMessage\(\s*\{\s*from:\s*'nv-shadow-attach'/);
});

test('hook: idempotent double-injection guard', () => {
  assert.match(hook, /if\s*\(\s*window\.__nvShadowHook\s*\)\s*return\s*;/);
  assert.match(hook, /window\.__nvShadowHook\s*=\s*true\s*;/);
});

test('hook: IIFE body whose catches all swallow — never breaks the page', () => {
  // Structural: the whole body lives in an IIFE wrapper, and every catch
  // block swallows (no rethrow may ever reach the page's attachShadow).
  assert.match(hook, /\(function\s*\(\s*\)\s*\{/);
  assert.match(hook, /\}\)\(\)\s*;?\s*$/);
  const catches = hook.match(/catch\s*\(\w*\)\s*\{[^}]*\}/g) ?? [];
  assert.ok(catches.length >= 2, `expected guarded catch blocks, got ${catches.length}`);
  for (const c of catches) assert.doesNotMatch(c, /\bthrow\b/);
});

test('hook: nv-shdw-<random> host key format', () => {
  assert.match(hook, /nv-shdw-/);
  assert.match(hook, /Math\.floor\(\s*Math\.random\(\)\s*\*\s*1e7\s*\)/);
});

test('hook: marks hosts with data-nv-shadowhost and syncs data-nv-active', () => {
  assert.match(hook, /data-nv-shadowhost/);
  assert.match(hook, /data-nv-active/);
});

test('SHADOW_HOST_ATTR export matches the hook attribute', () => {
  assert.equal(SHADOW_HOST_ATTR, 'data-nv-shadowhost');
});

test('decideObservers gains the shadow key driven by processShadowStyles', () => {
  assert.equal(decideObservers({}).shadow, false);
  assert.equal(decideObservers({ processShadowStyles: true }).shadow, true);
  assert.equal(decideObservers({ processShadowStyles: 1 }).shadow, false); // strict ===
});

// ---- M2c fix wave: constructed stylesheets are real insert targets ---------

// Shadow engine sheets are CONSTRUCTED CSSStyleSheets: they carry
// insertRule/cssRules themselves and have NO owner element, hence no `.sheet`
// attribute. Instances below mirror exactly that shape so the test fails if
// the engine resolves the sheet via `target.sheet` (rules would be silently
// swallowed by the insert catch, as between 14f2799 and the fix).
class FakeCSSStyleSheet {
  constructor() {
    this.cssRules = [];
    this.inserted = [];
    this.updates = [];
    this.disabled = false;
  }

  insertRule(css) {
    this.inserted.push(css);
    // Enough CSSOM shape for the conditioned update-in-place scan: a wrapped
    // block nests its rewritten rule; a plain rule carries selectorText.
    if (css.startsWith('@media')) {
      const inner = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}')).trim();
      this.cssRules.unshift({
        conditionText: css.slice(0, css.indexOf('{')).replace('@media', '').trim(),
        cssRules: [{ selectorText: inner.slice(0, inner.indexOf('{')).trim(), style: { setProperty: (p, v) => this.updates.push(`${p}:${v}`) } }],
      });
    } else {
      this.cssRules.unshift({ selectorText: css.slice(0, css.indexOf('{')).trim(), style: { setProperty: () => {} } });
    }
    return 0;
  }

  deleteRule() { this.cssRules.shift(); }
}

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

// Two hosts, each with an open shadow root holding one source sheet whose
// @media block wraps the SAME `.card` selector — the dedup-scoping case.
function makeShadowDom() {
  const byId = new Map();
  const mkHost = () => {
    const attrs = {};
    const srcSheet = {
      ownerNode: null,
      cssRules: [{
        constructor: { name: 'CSSMediaRule' },
        conditionText: '(max-width: 600px)',
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
    };
    const sr = { styleSheets: [srcSheet], adoptedStyleSheets: [], querySelectorAll: () => [] };
    const host = {
      localName: 'div',
      shadowRoot: sr,
      isConnected: true,
      hasAttribute: (k) => k in attrs,
      setAttribute: (k, v) => { attrs[k] = v; },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      removeAttribute: (k) => { delete attrs[k]; },
    };
    return { host, sr };
  };
  const hosts = [mkHost(), mkHost()];
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
      sheet: {
        cssRules: [],
        insertRule() { this.cssRules.unshift({ selectorText: '', style: { setProperty() {} } }); return 0; },
      },
    }),
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '*' ? hosts.map((h) => h.host) : []),
  };
  return { doc, srs: hosts.map((h) => h.sr) };
}

test('shadow emits land on constructed stylesheets and dedup scopes per target', (t) => {
  const prev = [globalThis.document, globalThis.MutationObserver, globalThis.CSSStyleSheet];
  const { doc, srs } = makeShadowDom();
  globalThis.document = doc;
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.CSSStyleSheet = FakeCSSStyleSheet;
  t.after(() => {
    [globalThis.document, globalThis.MutationObserver, globalThis.CSSStyleSheet] = prev;
  });

  activateEngine({ engine: { ...engineDefaults(), processMediaQueries: true } });
  engineProcessShadowRoots();

  // engineProcessShadowRoots REPLACES sr.adoptedStyleSheets — read after.
  const sheets = srs.map((sr) => sr.adoptedStyleSheets[0]);

  // Shadow rules emit in bare form (no html ancestor inside a shadow tree).
  const expected = '@media (max-width: 600px) { .card { color: var(--nv-text) } }';
  assert.equal(sheets.length, 2, 'each host adopted its own engine sheet');
  for (const [i, sheet] of sheets.entries()) {
    assert.equal(sheet.inserted.length, 1,
      `host ${i}: the rule landed on the constructed sheet (no .sheet attribute)`);
    assert.equal(sheet.inserted[0], expected);
  }
  assert.notEqual(sheets[0], sheets[1], 'the two targets are distinct sheets');

  // A second shadow pass must UPDATE in place (scoped dedup), not pile up.
  engineProcessShadowRoots();
  for (const [i, sheet] of sheets.entries()) {
    assert.equal(sheet.inserted.length, 1, `host ${i}: rescan adds no duplicate block`);
    assert.deepEqual(sheet.updates, ['color:var(--nv-text)'],
      `host ${i}: rescan rewrote host ${i}'s own rule, not the other target's`);
  }

  deactivateEngine();
  for (const sheet of sheets) {
    assert.equal(sheet.cssRules.length, 0, 'deactivate clears the shadow sheet');
    assert.equal(sheet.disabled, true, 'deactivate disables the shadow sheet');
  }
});
