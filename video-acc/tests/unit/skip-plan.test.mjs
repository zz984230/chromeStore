// tests/unit/skip-plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKIP_CEILING, INTRO_TUNING,
  clampSkip, introSeekTarget, outroAction, retuneIntro,
} from '../../src/shared/skipPlan.js';

test('常量与钳制', () => {
  assert.equal(SKIP_CEILING, 3600);
  assert.equal(INTRO_TUNING, 5);
  assert.equal(clampSkip(0), 0);
  assert.equal(clampSkip(-3), 0);
  assert.equal(clampSkip(9999), 3600);
  assert.equal(clampSkip(12.34), 12.3);
  assert.equal(clampSkip('x'), 0);
  assert.equal(clampSkip(NaN), 0);
});

test('片头：位置落在片头区间内才给跳点', () => {
  assert.equal(introSeekTarget({ position: 2, introSkip: 10 }), 10);
  assert.equal(introSeekTarget({ position: 10, introSkip: 10 }), null, '已过片头不跳');
  assert.equal(introSeekTarget({ position: 0, introSkip: 0 }), null, '未启用');
  assert.equal(introSeekTarget({ position: -1, introSkip: 10 }), null, '异常位置不跳');
});

test('片尾：进入区间后循环暂停、普通跳结尾', () => {
  assert.equal(outroAction({ remaining: 3, loop: true, outroSkip: 5 }), 'pause');
  assert.equal(outroAction({ remaining: 3, loop: false, outroSkip: 5 }), 'toEnd');
  assert.equal(outroAction({ remaining: 8, outroSkip: 5 }), null, '未进区间');
  assert.equal(outroAction({ remaining: 3, outroSkip: 0 }), null, '未启用');
});

test('快捷调参：±5 且调到正值自动启用', () => {
  assert.deepEqual(retuneIntro(0, 5), { introSkip: 5, skipOn: true });
  assert.deepEqual(retuneIntro(12, -5), { introSkip: 7, skipOn: true });
  assert.deepEqual(retuneIntro(3, -5), { introSkip: 0, skipOn: false }, '减到 0 即关');
  assert.deepEqual(retuneIntro(3599, 5), { introSkip: 3600, skipOn: true }, '上限钳制');
});
