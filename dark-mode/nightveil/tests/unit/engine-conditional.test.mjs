// tests/unit/engine-conditional.test.mjs
// M2c Task 1 (前置门①): conditional re-wrapping of @media/@supports children and
// wholesale @keyframes copying (M2-BEHAVIOR §4 d.1/d.2/d.3). Pure text builders —
// the wiring threads them through visitRule/insertEngineRule without DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapConditional, copyKeyframesBlock } from '../../src/content/engine/engine.js';

test('wrapConditional wraps a media condition around the rule text', () => {
  assert.equal(
    wrapConditional('media', '(max-width: 600px)', 'a { color: red }'),
    '@media (max-width: 600px) { a { color: red } }');
});

test('wrapConditional passes the rule through on an empty/whitespace condition', () => {
  assert.equal(wrapConditional('media', '', 'a { color: red }'), 'a { color: red }');
  assert.equal(wrapConditional('media', '   ', 'a { color: red }'), 'a { color: red }');
  assert.equal(wrapConditional('media', undefined, 'a { color: red }'), 'a { color: red }');
});

test('wrapConditional takes the at-rule keyword from the owning rule', () => {
  assert.equal(
    wrapConditional('supports', '(display: grid)', 'a { color: red }'),
    '@supports (display: grid) { a { color: red } }');
});

test('nested condition chain wraps outer-first (media over supports)', () => {
  const inner = wrapConditional('supports', '(display: grid)', 'a { color: red }');
  assert.equal(
    wrapConditional('media', '(max-width: 600px)', inner),
    '@media (max-width: 600px) { @supports (display: grid) { a { color: red } } }');
});

test('copyKeyframesBlock reproduces the block wholesale with keyframes in order', () => {
  const rule = {
    name: 'fade',
    cssRules: [{ cssText: 'from { color: #fff }' }, { cssText: 'to { color: #000 }' }],
  };
  assert.equal(
    copyKeyframesBlock(rule),
    '@keyframes fade { from { color: #fff } to { color: #000 } }');
});
