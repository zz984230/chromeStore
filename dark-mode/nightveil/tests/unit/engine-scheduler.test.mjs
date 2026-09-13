// tests/unit/engine-scheduler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../../src/content/engine/engine.js';

test('same-key schedules coalesce into one run; different keys run separately', () => {
  const runs = [];
  const timers = new Map();
  const id = { n: 0 };
  const setTimeoutStub = (fn) => { const k = ++id.n; timers.set(k, fn); return k; };
  const clearTimeoutStub = (k) => { timers.delete(k); };
  const s = createScheduler(setTimeoutStub, clearTimeoutStub);
  s.schedule('a', () => runs.push('a1'));
  s.schedule('a', () => runs.push('a2'));
  s.schedule('b', () => runs.push('b'));
  assert.equal(runs.length, 0, 'deferred until timer fires');
  for (const fn of [...timers.values()]) fn();
  assert.deepEqual(runs, ['a2', 'b'], 'same key: only the latest payload runs');
});

test('schedule forwards the delay argument to setTimeoutImpl', () => {
  const delays = [];
  const setTimeoutStub = (fn, delay) => { delays.push(delay); return 1; };
  const s = createScheduler(setTimeoutStub, () => {});
  s.schedule('po-long', () => {}, 300);
  assert.deepEqual(delays, [300], 'explicit delay reaches the timer impl');
});

test('cancel stops a pending run; cancelAll clears everything', () => {
  const runs = [];
  const timers = new Map();
  const id = { n: 0 };
  const s = createScheduler((fn) => { const k = ++id.n; timers.set(k, fn); return k; }, (k) => timers.delete(k));
  s.schedule('a', () => runs.push('a'));
  s.cancel('a');
  for (const fn of [...timers.values()]) fn();
  assert.deepEqual(runs, []);
  s.schedule('b', () => runs.push('b'));
  s.cancelAll();
  for (const fn of [...timers.values()]) fn();
  assert.deepEqual(runs, []);
});
