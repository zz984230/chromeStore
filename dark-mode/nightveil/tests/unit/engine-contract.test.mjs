// tests/unit/engine-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineDefaults, rewriteColor, isProcessableColor } from '../../src/content/engine/contract.js';

const D = engineDefaults();

test('context-aware off → always the fallback variable', () => {
  const out = rewriteColor('#ffffff', { type: 'background', engine: { ...D, contextAware: false }, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'var(--nv-surface)');
});

test('transparent maps to the transparent variable', () => {
  const out = rewriteColor('transparent', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'var(--nv-transparent)');
});

test('invalid color with fallback disabled still returns the fallback variable (fall-through)', () => {
  const out = rewriteColor('inherit', { type: 'background', engine: { ...D, fallback: { ...D.fallback, enabled: false } }, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'var(--nv-surface)');
});

test('invalid color with fallback enabled mixes fallback with transparency', () => {
  const out = rewriteColor('var(--unknown-x)', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'color-mix(in srgb, var(--nv-surface) 90%, transparent)');
});

test('very light color (luminance above max, near-white degree past gate) → fallback variable', () => {
  // #fefefe: l=0.996 → bp=100, outside near-white gate [5,95] → plain fallback
  const out = rewriteColor('#fefefe', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'var(--nv-surface)');
});

test('mid-luminance color darkens 10% for background, lightens 10% for text', () => {
  const bg = rewriteColor('#808080', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  const fg = rewriteColor('#808080', { type: 'text', engine: D, varMap: {}, selectorText: '.card' });
  assert.match(bg, /^#[0-9a-f]{8}$/);
  assert.notEqual(bg, fg, 'background darkens, text lightens — different outputs');
});

test('bright mid-luminance color darkens 50% instead of 10%', () => {
  // #e0e0e0: luminance 0.745 ∈ (0.10, 0.75]; l 0.878 > 0.75 → isbright + darken → 50%
  const out = rewriteColor('#e0e0e0', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, '#707070ff');
});

test('dark color below min luminance is preserved', () => {
  const out = rewriteColor('#101010', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, '#101010');
});

test('pure black always preserved', () => {
  const out = rewriteColor('#000000', { type: 'background', engine: { ...D, preserveDarkColors: false }, varMap: {}, selectorText: '.card' });
  assert.equal(out, '#000000');
});

test('near-white adjustment blends fallback with a computed darker hex', () => {
  // #f4f6f8: l=0.9647 → bp=floor((0.2147/0.25)^1.1×105)=88 ∈ [5,95];
  // darker = floor(10×0.88)=8 subtracted from #292929 → #212121
  const out = rewriteColor('#f4f6f8', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'color-mix(in srgb, var(--nv-surface) 12%, #212121 88%)');
});

test('alpha preservation mixes fallback with transparent for translucent colors', () => {
  const out = rewriteColor('rgba(255, 255, 255, 0.4)', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'color-mix(in srgb, var(--nv-surface), transparent 60%)');
});

test('var() references resolve through the map before evaluation', () => {
  const out = rewriteColor('var(--page-bg)', { type: 'background', engine: D, varMap: { 'var(--page-bg)': '#ffffff' }, selectorText: 'body' });
  assert.equal(out, 'var(--nv-surface)');
});

test('gradient value: remove-color option wins, then darken prefix', () => {
  const removed = rewriteColor('linear-gradient(red, blue)', {
    type: 'background', engine: { ...D, removeGradientColors: true }, varMap: {}, selectorText: '.card',
  });
  assert.equal(removed, 'var(--nv-surface)');
  const darkened = rewriteColor('linear-gradient(red, blue)', {
    type: 'background', engine: { ...D, darkenGradients: true, removeGradientColors: false }, varMap: {}, selectorText: '.card',
  });
  assert.ok(darkened.startsWith(D.gradientShade + ', '));
});

test('low alpha below the floor is returned untouched', () => {
  const out = rewriteColor('rgba(255, 255, 255, 0.05)', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'rgba(255, 255, 255, 0.05)');
});

test('processable gates per type', () => {
  assert.equal(isProcessableColor('inherit', 'text', D), false);
  assert.equal(isProcessableColor('currentcolor', 'text', D), false);
  assert.equal(isProcessableColor('#123456', 'text', D), true);
  assert.equal(isProcessableColor('none', 'svg', D), false);
  assert.equal(isProcessableColor('transparent', 'svg', D), false);
  assert.equal(isProcessableColor('red', 'svg', D), true);
  assert.equal(isProcessableColor('none', 'border', D), false);
  assert.equal(isProcessableColor('#fff', 'border', D), true);
  assert.equal(isProcessableColor('black', 'background', D), false);
  assert.equal(isProcessableColor('url(x.png)', 'background', D), false);
  assert.equal(isProcessableColor('inherit', 'background', D), false);
  assert.equal(isProcessableColor('initial', 'background', D), false);
  assert.equal(isProcessableColor('#f00', 'background', D), true);
  // gradient is processable only when one of the gradient options is on
  assert.equal(isProcessableColor('linear-gradient(a, b)', 'background', D), true);
  assert.equal(isProcessableColor('linear-gradient(a, b)', 'background', { ...D, removeGradientColors: false, darkenGradients: false }), false);
});
