// tests/unit/themes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTheme, compileThemeById } from '../../src/shared/themes.js';
import { findPalette, PALETTES } from '../../src/shared/palettes.js';

test('overlay compilation embeds all 9 palette colors and core selectors', () => {
  const css = compileTheme(findPalette('nv-simple'));
  for (const value of Object.values(findPalette('nv-simple').colors)) {
    assert.ok(css.includes(value), `missing color ${value}`);
  }
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /a:link/);
  assert.match(css, /a:visited/);
  assert.match(css, /input,\s*textarea,\s*select/);
  assert.match(css, /background-image:\s*none\s*!important/);
});

test('invert compilation carries filter params and protection list', () => {
  const css = compileTheme(findPalette('nv-inv-balanced'));
  assert.match(css, /filter:\s*invert\(100%\)/);
  assert.match(css, /brightness\(105%\)/);
  assert.match(css, /contrast\(105%\)/);
  assert.ok(css.includes('img'), 'media protection missing');
  assert.ok(css.includes('canvas'), 'canvas protection missing');
  assert.ok(css.includes('iframe'), 'iframe protection missing');
});

test('every palette compiles to non-empty css; unknown family throws; id helper works', () => {
  for (const p of PALETTES) {
    const css = compileTheme(p);
    assert.ok(typeof css === 'string' && css.length > 200, `${p.id} compiled too small`);
  }
  assert.throws(() => compileTheme({ id: 'x', family: 'nope' }), /unknown family/);
  assert.equal(compileThemeById('nv-midnight'), compileTheme(findPalette('nv-midnight')));
});
