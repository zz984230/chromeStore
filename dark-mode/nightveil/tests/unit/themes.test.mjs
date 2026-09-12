// tests/unit/themes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTheme, compileThemeById, guardBackgroundFor } from '../../src/shared/themes.js';
import { findPalette, PALETTES } from '../../src/shared/palettes.js';

test('overlay compilation embeds all 9 palette colors and core selectors', () => {
  const css = compileTheme(findPalette('nv-simple'));
  for (const value of Object.values(findPalette('nv-simple').colors)) {
    assert.ok(css.includes(value), `missing color ${value}`);
  }
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /body :is\(a:link, a:link \*\):is\(#nv-sheet, \*\)/);
  assert.match(css, /body :is\(a:visited, a:visited \*\):is\(#nv-sheet, \*\)/);
  assert.match(css, /body input,\s*body textarea,\s*body select/);
  assert.match(css, /background-image:\s*none\s*!important/);
  assert.match(css, /body \* {[^}]*background-color/s);
  assert.match(css, /body :is\(#nv-sheet, \*\):not\(\[data-nv-stage\]\):not\(\[data-nv-stage\] \*\) \{ background-image: none !important; \}/);
  assert.match(css, /body :is\(#nv-sheet, \*\) \{\n  color: /, 'color lift selector missing');
  assert.match(css, /body :is\(#nv-sheet, \*\) \{[^}]*text-indent: 0 !important/s, 'text-indent recall missing');
  assert.ok(css.includes('body :is(cite, q, blockquote):is(#nv-sheet, *)'), 'cite specificity lift missing');
  assert.match(css, /body \[data-nv-stage\], body \[data-nv-stage\] \* \{ background-color: transparent !important; \}/);
});

test('invert compilation carries filter params and protection list', () => {
  const css = compileTheme(findPalette('nv-inv-balanced'));
  assert.match(css, /filter:\s*invert\(100%\)/);
  assert.match(css, /brightness\(105%\)/);
  assert.match(css, /contrast\(105%\)/);
  assert.match(css, /img, video, canvas, iframe, embed, object, svg image/, 'media protection list missing');
  assert.equal(
    css.split('filter: invert(100%) hue-rotate(180deg);').length - 1,
    1,
    'media protection must re-apply inversion only (no tone params)',
  );
});

test('every palette compiles to non-empty css; unknown family throws; id helper works', () => {
  for (const p of PALETTES) {
    const css = compileTheme(p);
    assert.ok(typeof css === 'string' && css.length > 200, `${p.id} compiled too small`);
  }
  assert.throws(() => compileTheme({ id: 'x', family: 'nope' }), /unknown family/);
  assert.equal(compileThemeById('nv-midnight'), compileTheme(findPalette('nv-midnight')));
});

test('guardBackgroundFor uses palette bg for overlay and neutral dark for invert', () => {
  assert.equal(guardBackgroundFor(findPalette('nv-midnight')), findPalette('nv-midnight').colors.bg);
  assert.equal(guardBackgroundFor(findPalette('nv-simple')), '#1e2229');
  assert.equal(guardBackgroundFor(findPalette('nv-inv-soft')), '#1e2229');
});
