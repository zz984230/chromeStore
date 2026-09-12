// tests/unit/palettes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, findPalette } from '../../src/shared/palettes.js';

const HEX = /^#[0-9a-f]{6}$/;

test('palette set is exactly 40: 26 overlay + 14 invert, unique ids', () => {
  assert.equal(PALETTES.length, 40);
  const byFamily = { overlay: 0, invert: 0 };
  const ids = new Set();
  for (const p of PALETTES) {
    byFamily[p.family] += 1;
    ids.add(p.id);
    assert.ok(p.id.startsWith('nv-'), `bad id ${p.id}`);
    assert.ok(p.label.length > 0, `empty label for ${p.id}`);
  }
  assert.equal(byFamily.overlay, 26);
  assert.equal(byFamily.invert, 14);
  assert.equal(ids.size, 40);
});

test('overlay palettes carry 9 valid hex colors; invert palettes carry numeric params', () => {
  for (const p of PALETTES) {
    if (p.family === 'overlay') {
      for (const [name, value] of Object.entries(p.colors)) {
        assert.match(value, HEX, `${p.id}.${name} = ${value}`);
      }
      assert.equal(Object.keys(p.colors).length, 9);
    } else {
      for (const v of Object.values(p.params)) {
        assert.equal(typeof v, 'number');
        assert.ok(v >= 0 && v <= 200, `${p.id} param out of range: ${v}`);
      }
    }
  }
});

test('findPalette returns exact match, falls back to nv-simple', () => {
  assert.equal(findPalette('nv-midnight').id, 'nv-midnight');
  assert.equal(findPalette('nope').id, 'nv-simple');
});

test('every overlay border is visible against its bg (luminance delta >= 14)', () => {
  const lum = (hex) => {
    const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  for (const p of PALETTES) {
    if (p.family !== 'overlay') continue;
    const delta = Math.abs(lum(p.colors.border) - lum(p.colors.bg)) * 100;
    assert.ok(delta >= 14, `${p.id} border-vs-bg luminance delta ${delta.toFixed(1)} < 14`);
  }
});
