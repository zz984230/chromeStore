// tests/unit/guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTripWatch } from '../../src/content/guard.js';

test('窗口内放行至上限，超出熔断且 onTrip 恰好一次', () => {
  const tripped = [];
  const watch = createTripWatch({ windowMs: 800, ceiling: 3, now: () => 1000, onTrip: (k) => tripped.push(k) });
  const key = {};
  for (let i = 0; i < 3; i++) assert.equal(watch.allows(key), true, `第 ${i + 1} 次应放行`);
  assert.equal(watch.allows(key), false, '第 4 次应熔断');
  assert.equal(watch.allows(key), false, '熔断后持续拒绝');
  assert.deepEqual(tripped, [key], 'onTrip 恰好一次');
});

test('窗口滑过后重新计数', () => {
  let t = 1000;
  const watch = createTripWatch({ windowMs: 800, ceiling: 2, now: () => t });
  const key = {};
  assert.equal(watch.allows(key), true);
  assert.equal(watch.allows(key), true);
  assert.equal(watch.allows(key), false);
  t += 801; // 越过窗口
  assert.equal(watch.allows(key), true, '新窗口重新计数');
});

test('reset 清账：计数归零且解除熔断', () => {
  let t = 1000;
  const watch = createTripWatch({ windowMs: 800, ceiling: 1, now: () => t });
  const key = {};
  assert.equal(watch.allows(key), true);
  assert.equal(watch.allows(key), false);
  watch.reset(key);
  assert.equal(watch.allows(key), true, 'reset 后重新放行');
});

test('不同 key 互不影响', () => {
  const watch = createTripWatch({ windowMs: 800, ceiling: 1, now: () => 1000 });
  const a = {}, b = {};
  assert.equal(watch.allows(a), true);
  assert.equal(watch.allows(a), false);
  assert.equal(watch.allows(b), true, 'b 有独立账目');
});
