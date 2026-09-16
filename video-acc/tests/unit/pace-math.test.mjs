// tests/unit/pace-math.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACE_MIN, PACE_MAX, BUMP, PRESETS,
  clampPace, bumpPace, samePace, formatPace,
} from '../../src/shared/paceMath.js';

test('档位常量与行为规格一致', () => {
  assert.equal(PACE_MIN, 0.07);
  assert.equal(PACE_MAX, 16);
  assert.equal(BUMP, 0.25);
  assert.deepEqual(PRESETS, [0.5, 0.75, 1, 1.25, 1.5, 2, 3]);
});

test('clampPace 钳制到范围并修整两位小数', () => {
  assert.equal(clampPace(32), 16);
  assert.equal(clampPace(0.01), 0.07);
  assert.equal(clampPace(1.999), 2);
  assert.equal(clampPace(2.050000001), 2.05);
  assert.equal(clampPace(NaN), 1);
  assert.equal(clampPace('abc'), 1);
});

test('bumpPace 按步进增减且在边界饱和', () => {
  assert.equal(bumpPace(1, 1), 1.25);
  assert.equal(bumpPace(1, -1), 0.75);
  assert.equal(bumpPace(16, 1), 16);
  assert.equal(bumpPace(0.07, -1), 0.07);
});

test('samePace 用 epsilon 比较', () => {
  assert.ok(samePace(1.25, 1.25005));
  assert.ok(!samePace(1.25, 1.3));
});

test('formatPace 输出紧凑档位文本', () => {
  assert.equal(formatPace(1), '1×');
  assert.equal(formatPace(2), '2×');
  assert.equal(formatPace(1.5), '1.5×');
  assert.equal(formatPace(0.07), '0.07×');
  assert.equal(formatPace(2.05), '2.05×');
  assert.equal(formatPace(0.75), '0.75×');
});
