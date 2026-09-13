// tests/unit/engine-selectors.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { transformSelector } from '../../src/content/engine/selectors.js';

const KEY = 'html[data-nv-active]';
const none = () => 2;   // countFn 桩：html token 不独占（默认路径）
const solo = () => 0;   // countFn 桩：token 只命中 html 自身

test('plain selectors get the html prefix', () => {
  assert.equal(transformSelector('.card', [], none), `${KEY} .card`);
  assert.equal(transformSelector('.deep .inner .leaf', [], none), `${KEY} .deep .inner .leaf`);
});

test('comma groups transform per segment; pseudo-only segments dropped', () => {
  assert.equal(transformSelector('.a, .b', [], none), `${KEY} .a, ${KEY} .b`);
  assert.equal(transformSelector('::selection', [], none), '');
  assert.equal(transformSelector('.a, ::-webkit-scrollbar', [], none), `${KEY} .a`);
});

test('bare universal expands to both forms', () => {
  assert.equal(transformSelector('*', [], none), `${KEY}, ${KEY} *`);
  assert.equal(transformSelector('*.foo', [], none), `${KEY} *.foo`);
});

test('html/:root/:host segments rewrite in place', () => {
  assert.equal(transformSelector('html body', [], none), `${KEY} body`);
  assert.equal(transformSelector(':root', [], none), ':root[data-nv-active]');
  assert.equal(transformSelector(':host(.foo)', [], none), ':host(.foo[data-nv-active])');
});

test('html-matching attribute token chains without space when it targets html itself', () => {
  // [data-theme] matches html (count 0) → chained selector, no space
  assert.equal(transformSelector('[data-theme="dark"] .x', ['[data-theme]', '[data-theme="dark"]'], solo),
    `${KEY}[data-theme="dark"] .x`);
});

test('html-matching class token dual-forms when it also matches other elements', () => {
  // .dark matches html AND other nodes (count 2) → both chained and descendant
  assert.equal(transformSelector('.dark .x', ['.dark'], none),
    `${KEY}.dark .x, ${KEY} .dark .x`);
});

test('child combinator segment always uses the space form', () => {
  assert.equal(transformSelector('.dark > .x', ['.dark'], none), `${KEY} .dark > .x`);
});

test('function/attr commas are not split', () => {
  assert.equal(transformSelector(':is(a, b) .c', [], none), `${KEY} :is(a, b) .c`);
});

// Shadow context (§5): shadow trees have no html ancestor, so segments emit
// bare — the host sheet's disabled flag is the on/off switch.
test('bare mode: plain, universal and attr segments emit unprefixed', () => {
  assert.equal(transformSelector('.btn', [], none, { bare: true }), '.btn');
  assert.equal(transformSelector('*', [], none, { bare: true }), '*');
  assert.equal(transformSelector('*.foo', [], none, { bare: true }), '*.foo');
  assert.equal(transformSelector('.deep .inner .leaf', [], none, { bare: true }), '.deep .inner .leaf');
  assert.equal(transformSelector('[data-x] .y', ['[data-x]'], solo, { bare: true }), '[data-x] .y');
});

test('bare mode: html/:root/:host still rewrite in place; pseudo-only still drops', () => {
  assert.equal(transformSelector('html body', [], none, { bare: true }), `${KEY} body`);
  assert.equal(transformSelector(':root', [], none, { bare: true }), ':root[data-nv-active]');
  assert.equal(transformSelector(':host', [], none, { bare: true }), ':host([data-nv-active])');
  assert.equal(transformSelector(':host(.x)', [], none, { bare: true }), ':host(.x[data-nv-active])');
  assert.equal(transformSelector('::selection', [], none, { bare: true }), '');
  assert.equal(transformSelector('.a, ::-webkit-scrollbar', [], none, { bare: true }), '.a');
});
