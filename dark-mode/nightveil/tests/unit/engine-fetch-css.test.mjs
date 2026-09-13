// tests/unit/engine-fetch-css.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { absolutizeUrls, shouldFetch, fetchRemoteCss } from '../../src/content/engine/fetchCss.js';

test('absolutizeUrls rewrites relative urls against the sheet base, keeps data/absolute', () => {
  const css = 'a{background:url(img/x.png)} b{background:url("y.png")} c{background:url(data:image/png;base64,AAA)} d{background:url(https://e/f.png)}';
  const out = absolutizeUrls(css, 'https://cdn.example.com/lib/sheet.css');
  assert.ok(out.includes('url(https://cdn.example.com/lib/img/x.png)'));
  assert.ok(out.includes('url("https://cdn.example.com/lib/y.png")'));
  assert.ok(out.includes('data:image/png;base64,AAA'));
  assert.ok(out.includes('url(https://e/f.png)'));
});

test('shouldFetch accepts http(s) css and non-font urls, rejects non-css fonts and others', () => {
  assert.equal(shouldFetch('https://x.com/a.css'), true);
  assert.equal(shouldFetch('https://x.com/styles? v=2'), true); // http + not font
  // 原版字体过滤只作用于非 .css URL：.css 后缀短路通过（font.css 也会被代取）
  assert.equal(shouldFetch('https://x.com/font.css'), true);
  assert.equal(shouldFetch('https://x.com/assets/fonts/main.css'), true);
  assert.equal(shouldFetch('https://fonts.gstatic.com/s/font.woff2'), false);
  assert.equal(shouldFetch('about:blank'), false);
  assert.equal(shouldFetch('//x.com/a.css'), true); // protocol-relative resolves to http
});

// The brief's fetchRemoteCss tests were authored for the browser, where
// document.location exists; in node there is no document. The controller
// resolution reconstructs the browser condition for the same-origin tests
// (assertions stay verbatim) and cleans up afterwards.
function withPageOrigin(href, origin, body) {
  return async () => {
    globalThis.document = { location: { href, origin } };
    try { await body(); } finally { delete globalThis.document; }
  };
}

test('fetchRemoteCss prefers page fetch same-origin, background proxy cross-origin',
  withPageOrigin('https://site.com/x.css', 'https://site.com', async () => {
    const calls = { page: [], bg: [] };
    const pageFetch = async (href) => { calls.page.push(href); return { ok: true, clone: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }), text: async () => '.a{color:red}' }; };
    const bg = async (href) => { calls.bg.push(href); return { ok: true, content: '.b{color:blue}' }; };
    const same = await fetchRemoteCss('https://site.com/x.css', { fetchImpl: pageFetch, sendToBackground: bg });
    assert.equal(same, '.a{color:red}');
    assert.equal(calls.bg.length, 0);
    const cross = await fetchRemoteCss('https://cdn.other.com/x.css', { fetchImpl: pageFetch, sendToBackground: bg });
    assert.equal(cross, '.b{color:blue}');
    assert.deepEqual(calls.bg, ['https://cdn.other.com/x.css']);
  }));

test('fetchRemoteCss returns null on page-fetch failure after background fallback fails too',
  withPageOrigin('https://site.com/x.css', 'https://site.com', async () => {
    const pageFetch = async () => { throw new Error('cors'); };
    const bg = async () => ({ ok: false, content: null });
    assert.equal(await fetchRemoteCss('https://site.com/x.css', { fetchImpl: pageFetch, sendToBackground: bg }), null);
  }));

test('html responses are discarded',
  withPageOrigin('https://site.com/x.css', 'https://site.com', async () => {
    const pageFetch = async () => ({ ok: true, clone: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }), text: async () => '<!DOCTYPE html><html></html>' });
    assert.equal(await fetchRemoteCss('https://site.com/x.css', { fetchImpl: pageFetch, sendToBackground: async () => ({ ok: false }) }), null);
  }));

test('nul bytes trigger utf-16 re-decode',
  withPageOrigin('https://site.com/x.css', 'https://site.com', async () => {
    const buf = new Uint16Array(['.'.codePointAt(0), 'a'.codePointAt(0)]).buffer;
    const pageFetch = async () => ({ ok: true, clone: () => ({ arrayBuffer: async () => buf }), text: async () => '\x00.a' });
    const out = await fetchRemoteCss('https://site.com/x.css', { fetchImpl: pageFetch, sendToBackground: async () => ({ ok: false }) });
    assert.equal(out, '.a');
  }));
