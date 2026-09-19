// tests/unit/strings-zh.test.mjs
// M3+ Q5 裁决：用户可见文案全部中文化；开发者日志键保持英文。钉住语言面，
// 防止后续任务顺手回退英文。
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from '../../src/shared/strings.js';

const DEV_LOG_KEYS = ['swStartedDebug', 'contentActiveLog', 'optionsSaveError'];

test('every user-visible string contains CJK (Chinese UI ruling)', () => {
  const offenders = [];
  for (const [k, v] of Object.entries(STRINGS)) {
    if (DEV_LOG_KEYS.includes(k)) continue;
    if (typeof v === 'string' && v && !/[一-鿿]/.test(v)) offenders.push(k);
  }
  assert.deepEqual(offenders, []);
});

test('dev-log keys stay English', () => {
  for (const k of DEV_LOG_KEYS) assert.match(STRINGS[k], /^[A-Za-z]/);
});
