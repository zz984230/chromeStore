// tests/unit/engine-fetch-clone.test.mjs
// Cross-origin clone bookkeeping (M2b deferred minor): clones carry
// data-nv-href, requestSheetFetch reuses a surviving clone instead of
// re-fetching, and deactivateEngine clears the module-level `fetched` set so
// a link the page removed and re-added with the same href re-fetches (its old
// clone died with it).
// Node has no DOM — engine.js only touches document/MutationObserver/chrome
// inside functions, so the public API is driven against jsdom-free stubs
// (same harness shape as engine-lifecycle.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { activateEngine, deactivateEngine, hasCloneFor } from '../../src/content/engine/engine.js';
import { engineDefaults } from '../../src/content/engine/contract.js';

const CSS = '.a{color:#fefefe}';

// ---- pure predicate: injectable root stub ----------------------------------

test('hasCloneFor returns the clone whose data-nv-href matches', () => {
  const href = 'https://cdn.other.com/a.css';
  const clone = { getAttribute: (n) => (n === 'data-nv-href' ? href : null) };
  const other = { getAttribute: () => 'https://cdn.other.com/other.css' };
  // clones for different hrefs coexist and document order is not href order
  const root = { querySelectorAll: () => [other, clone] };
  assert.equal(hasCloneFor(href, root), clone);
});

test('hasCloneFor returns null when no clone matches or none exist', () => {
  const href = 'https://cdn.other.com/a.css';
  const other = { getAttribute: () => 'https://cdn.other.com/other.css' };
  assert.equal(hasCloneFor(href, { querySelectorAll: () => [other] }), null);
  assert.equal(hasCloneFor(href, { querySelectorAll: () => [] }), null);
});

// ---- behavioral pins through activateEngine/deactivateEngine ---------------

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

// Document stub covering exactly what the activation/fetch path touches: one
// cross-origin sheet (cssRules unreadable → fetch path), the clone-sweep
// selectors, and a createElement factory whose styles join `clones` when
// marked data-nv-cloned. Clearing `clones` simulates the page removing a
// clone. The cross-origin fetch goes through the background-proxy stub, which
// records every requested href.
function makeFetchDom(href) {
  const clones = [];
  const bgFetches = [];
  const link = { id: '', appendChild() {} };
  const crossSheet = {
    href,
    ownerNode: link,
    get cssRules() { throw new TypeError('Failed to read the cssRules'); },
  };
  const doc = {
    location: { href: 'https://site.test/page', origin: 'https://site.test' },
    documentElement: {
      id: '', classList: [], attributes: [],
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    },
    head: { appendChild() {} },
    body: null,
    readyState: 'complete',
    styleSheets: [crossSheet],
    getElementById: () => null,
    createElement: () => {
      const el = {
        id: '', textContent: '',
        attrs: new Map(),
        sheet: { disabled: false, cssRules: [], insertRule: () => 0 },
        setAttribute(name, v) {
          el.attrs.set(name, v);
          if (name === 'data-nv-cloned') clones.push(el);
        },
        getAttribute: (name) => (el.attrs.has(name) ? el.attrs.get(name) : null),
        removeAttribute: (name) => { el.attrs.delete(name); },
      };
      return el;
    },
    querySelector: () => null,
    querySelectorAll: (sel) => (sel.includes('data-nv-cloned') ? [...clones] : []),
  };
  return { doc, clones, bgFetches };
}

function installGlobals(t, h) {
  const prev = [globalThis.document, globalThis.MutationObserver, globalThis.chrome];
  globalThis.document = h.doc;
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.chrome = {
    runtime: {
      sendMessage: (msg, cb) => { h.bgFetches.push(msg.href); cb({ ok: true, content: CSS }); },
    },
  };
  t.after(() => {
    [globalThis.document, globalThis.MutationObserver, globalThis.chrome] = prev;
  });
}

// requestSheetFetch is fire-and-forget async; let the fetch + clone land.
const settle = () => new Promise((r) => setImmediate(r));

// The defect: `fetched` survived teardown, so a page that removed and re-added
// a link with the same href (old clone gone) never re-fetched its CSS.
test('re-added link with a dead clone re-fetches after deactivate cleared fetched', async (t) => {
  const h = makeFetchDom('https://cdn.other.com/a.css');
  installGlobals(t, h);
  const settings = { engine: engineDefaults() };

  activateEngine(settings);
  await settle();
  assert.equal(h.bgFetches.length, 1, 'first activation fetches the cross-origin sheet');

  deactivateEngine();          // clone sleeps
  h.clones.length = 0;         // …then the page removes link AND clone

  activateEngine(settings);    // re-added link re-presents the same href
  await settle();
  assert.equal(h.bgFetches.length, 2, 'stale `fetched` must not block the re-fetch');
  assert.equal(h.clones.length, 1, 'exactly one (fresh) clone for the href');
});

// Guards the naive fix (clearing `fetched` alone): links that KEPT their clone
// must reuse it, not pile up duplicate clones and duplicate fetches.
test('a surviving clone is revived and reused — no duplicate fetch or clone', async (t) => {
  const h = makeFetchDom('https://cdn.other.com/b.css');
  installGlobals(t, h);
  const settings = { engine: engineDefaults() };

  activateEngine(settings);
  await settle();
  assert.equal(h.bgFetches.length, 1);
  assert.equal(h.clones.length, 1);
  assert.equal(h.clones[0].getAttribute('data-nv-href'), 'https://cdn.other.com/b.css',
    'clone records the href it was fetched for');

  deactivateEngine();
  assert.equal(h.clones[0].sheet.disabled, true, 'teardown sleeps the clone');

  activateEngine(settings);    // clone survived — the site left it in place
  await settle();
  assert.equal(h.bgFetches.length, 1, 'no re-fetch while the clone lives');
  assert.equal(h.clones.length, 1, 'no duplicate clone');
  assert.equal(h.clones[0].sheet.disabled, false, 'clone revived for scanning');
  deactivateEngine();
});
