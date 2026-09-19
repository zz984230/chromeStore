// tests/unit/engine-conditional.test.mjs
// M2c Task 1 (前置门①): conditional re-wrapping of @media/@supports children and
// wholesale @keyframes copying (M2-BEHAVIOR §4 d.1/d.2/d.3). Pure text builders —
// the wiring threads them through visitRule/insertEngineRule without DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapConditional, copyKeyframesBlock, conditionsKeyFragment } from '../../src/content/engine/engine.js';

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

// ---- M3 keyframes conditions threading (plan Task 6; M3-BEHAVIOR §7.1) ----

test('copyKeyframesBlock wraps the copy in the accumulated condition chain (outer first)', () => {
  const rule = { name: 'fade', cssRules: [{ cssText: 'from { color: #fff }' }] };
  const conds = [{ at: 'media', text: '(min-width: 0px)' }, { at: 'supports', text: '(display: grid)' }];
  assert.equal(
    copyKeyframesBlock(rule, conds),
    '@media (min-width: 0px) { @supports (display: grid) { @keyframes fade { from { color: #fff } } } }');
});

test('conditionsKeyFragment distinguishes identical names under different conditions (dedup-key widening)', () => {
  const a = conditionsKeyFragment([{ at: 'media', text: '(min-width: 0px)' }]);
  const b = conditionsKeyFragment([{ at: 'media', text: '(max-width: 600px)' }]);
  const none = conditionsKeyFragment([]);
  assert.notEqual(a, b);
  assert.notEqual(a, none);
});
