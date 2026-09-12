// tests/unit/exclusion-rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseList, luminanceOf, metaSchemeIsDark, evaluateRules } from '../../src/shared/exclusionRules.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

test('parseList splits, trims, and drops empties', () => {
  assert.deepEqual(parseList(' data-theme=dark , ,darkmode '), ['data-theme=dark', 'darkmode']);
  assert.deepEqual(parseList(null), []);
});

test('luminanceOf parses rgb/rgba; transparent and junk yield null', () => {
  assert.equal(luminanceOf('rgb(12, 12, 12)'), 12);
  assert.equal(luminanceOf('rgb(255, 255, 255)'), 255);
  assert.equal(luminanceOf('rgba(0, 0, 0, 0)'), null);
  assert.equal(luminanceOf(''), null);
});

test('metaSchemeIsDark excludes dark-only declarations, not dual-mode ones', () => {
  assert.equal(metaSchemeIsDark('dark'), true);
  assert.equal(metaSchemeIsDark(' Dark '), true);
  assert.equal(metaSchemeIsDark('only dark'), true);
  assert.equal(metaSchemeIsDark('light dark'), false);
  assert.equal(metaSchemeIsDark(''), false);
});

test('evaluateRules: default rules skip meta-dark and html signals', () => {
  const r = DEFAULT_SETTINGS.exclusionRules;
  assert.equal(evaluateRules(r, { metaSchemeDark: true }), true);
  assert.equal(evaluateRules(r, { htmlAttrs: ['data-theme=dark'] }), true);
  assert.equal(evaluateRules(r, { htmlClasses: ['darkmode'] }), true);
  assert.equal(evaluateRules(r, {}), false);
  assert.equal(evaluateRules(undefined, { metaSchemeDark: true }), false, 'rules are defensive');
});

test('evaluateRules: dark background honors toggle and threshold', () => {
  const r = { ...DEFAULT_SETTINGS.exclusionRules, darkBackground: true, brightnessThreshold: 50 };
  assert.equal(evaluateRules(r, { bgLuminance: 40 }), true);
  assert.equal(evaluateRules(r, { bgLuminance: 120 }), false);
  assert.equal(evaluateRules(r, { bgLuminance: null }), false);
  assert.equal(evaluateRules(DEFAULT_SETTINGS.exclusionRules, { bgLuminance: 10 }), false, 'toggle off by default');
});

test('evaluateRules: custom attribute and cookie lists replace defaults', () => {
  const r = { ...DEFAULT_SETTINGS.exclusionRules, cookies: 'night_mode, theme', htmlAttributes: 'data-night' };
  assert.equal(evaluateRules(r, { cookieNames: ['night_mode'] }), true);
  assert.equal(evaluateRules(r, { htmlAttrs: ['data-night'] }), true);
  assert.equal(evaluateRules(r, { htmlAttrs: ['data-theme=dark'] }), false);
});

test('evaluateRules: brightnessThreshold 0 is honored, not coerced to the default', () => {
  const r = { ...DEFAULT_SETTINGS.exclusionRules, darkBackground: true, brightnessThreshold: 0 };
  assert.equal(evaluateRules(r, { bgLuminance: 0 }), true, 'luma 0 must be excluded at threshold 0');
  assert.equal(evaluateRules(r, { bgLuminance: 1 }), false);
});
