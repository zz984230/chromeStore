// tests/unit/color-math.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, toHex8, luminanceOf, darken, lighten, hslOf, NAMED_COLORS } from '../../src/shared/colorMath.js';

test('parses hex 3/4/6/8 forms', () => {
  assert.deepEqual(parseColor('#abc'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
  assert.deepEqual(parseColor('#abcd'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 0xdd / 255 });
  assert.deepEqual(parseColor('#292929'), { r: 0x29, g: 0x29, b: 0x29, a: 1 });
  assert.deepEqual(parseColor('#8db2e5cc'), { r: 0x8d, g: 0xb2, b: 0xe5, a: 0xcc / 255 });
});

test('parses rgb/rgba comma and space separated, hsl/hsla with percents', () => {
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseColor('rgba(10 20 30 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor('hsl(120, 50%, 50%)'), { r: 64, g: 191, b: 64, a: 1 });
  const h = parseColor('hsla(0, 100%, 50%, .25)');
  assert.equal(h.a, 0.25); assert.equal(h.r, 255);
});

test('parses the 146 named colors; unknown and modern syntax return null', () => {
  assert.equal(NAMED_COLORS.rebeccapurple, '#663399');
  assert.deepEqual(parseColor('cornflowerblue'), { r: 0x64, g: 0x95, b: 0xed, a: 1 });
  assert.equal(parseColor('oklch(0.5 0.1 20)'), null);
  assert.equal(parseColor('color-mix(in srgb, red, blue)'), null);
  assert.equal(parseColor('rgb(1 2 3 / 50%)'), null); // 斜杠透明度不在原版解析面内
});

test('toHex8 formats lowercase 8-digit hex', () => {
  assert.equal(toHex8({ r: 0x1a, g: 0x2b, b: 0x3c, a: 1 }), '#1a2b3cff');
  assert.equal(toHex8({ r: 255, g: 0, b: 15, a: 0 }), '#ff000f00');
});

test('luminance follows WCAG linearization anchors', () => {
  assert.equal(luminanceOf({ r: 0, g: 0, b: 0 }), 0);
  assert.equal(luminanceOf({ r: 255, g: 255, b: 255 }), 1);
  assert.ok(Math.abs(luminanceOf({ r: 0xd9, g: 0xdc, b: 0xdc }) - 0.716) < 0.005);
});

test('darken/lighten work in HSL space like the reference library', () => {
  const base = parseColor('#808080'); // l = 0.502
  const d = darken(base, 0.10);
  assert.ok(Math.abs(hslOf(d).l - 0.502 * 0.90) < 0.005);
  const l = lighten(base, 0.10);
  assert.ok(Math.abs(hslOf(l).l - (0.502 + 0.498 * 0.10)) < 0.005);
  assert.equal(d.a, 1, 'alpha preserved');
});
