// tests/unit/engine-class-mutation.test.mjs
// Pure parts of M2b Task 4: the class-MO self-feedback filter and the
// new-element dedup key. Observer wiring (attach/dispatch) is verified via
// heavy.html in Task 8, same split as engine-inline.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isForeignClassMutation, newElementKey } from '../../src/content/engine/engine.js';

test('isForeignClassMutation truth table (true = schedule-worthy)', () => {
  const cases = [
    // identical token sets → nothing foreign changed
    ['a b', 'a b', false],
    // a foreign token appeared
    ['a', 'a b', true],
    // only an nv- token was added → our own write, ignore
    ['a', 'a nv-inline-123', false],
    ['nv-inline-1', 'nv-inline-1 nv-inline-2', false],
    ['', 'nv-shdw-5', false],
    // a foreign token swapped while nv- tokens ride along
    ['a nv-inline-1', 'b nv-inline-1', true],
    // missing old/new value cannot prove the change was ours → schedule
    [null, 'anything', true],
    ['x', null, true],
  ];
  for (const [oldValue, newValue, want] of cases) {
    assert.equal(isForeignClassMutation(oldValue, newValue), want,
      `(${JSON.stringify(oldValue)}, ${JSON.stringify(newValue)}) → ${want}`);
  }
});

test('newElementKey: id wins over className', () => {
  assert.equal(newElementKey({ id: 'main', className: 'a b' }), 'main');
});

test('newElementKey: className key is the full className string', () => {
  assert.equal(newElementKey({ id: '', className: 'a b' }), 'a b');
  assert.equal(newElementKey({ className: 'nv-inline-1 real' }), 'nv-inline-1 real',
    'mixed class keeps nv- tokens in the key (any change to it is foreign)');
});

test('newElementKey: nv-only class or no id/class → null (not schedule-worthy)', () => {
  assert.equal(newElementKey({ className: 'nv-inline-1 nv-inline-2' }), null);
  assert.equal(newElementKey({ id: '', className: 'nv-shdw-5' }), null);
  assert.equal(newElementKey({ id: '', className: '' }), null);
  assert.equal(newElementKey({}), null);
});
