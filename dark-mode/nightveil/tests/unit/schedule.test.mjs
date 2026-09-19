// tests/unit/schedule.test.mjs
// M3-BEHAVIOR §3：一次性 alarm 时刻计算、状态补丁、同步编排（chrome.alarms 内存双打）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALARM_ON, ALARM_OFF, nextAlarmTime, alarmStatePatch, syncAlarms } from '../../src/shared/schedule.js';

const NOW = new Date(2026, 8, 19, 10, 0, 0).getTime(); // 2026-09-19 10:00 local

test('nextAlarmTime: later today → today; already past → tomorrow (§3.2)', () => {
  assert.equal(nextAlarmTime('11:30', NOW), new Date(2026, 8, 19, 11, 30, 0, 0).getTime());
  assert.equal(nextAlarmTime('07:00', NOW), new Date(2026, 8, 20, 7, 0, 0, 0).getTime());
});

test('nextAlarmTime: empty or malformed → null; boundary midnight ok', () => {
  assert.equal(nextAlarmTime('', NOW), null);
  assert.equal(nextAlarmTime(undefined, NOW), null);
  assert.equal(nextAlarmTime('25:00', NOW), null);
  assert.equal(nextAlarmTime('7:30', NOW), null, '非 HH:MM 两位格式拒绝');
  assert.equal(nextAlarmTime('00:00', NOW), new Date(2026, 8, 20, 0, 0, 0, 0).getTime());
});

test('alarmStatePatch maps the two names onto state flips (§3.2)', () => {
  assert.deepEqual(alarmStatePatch(ALARM_ON), { state: 'dark' });
  assert.deepEqual(alarmStatePatch(ALARM_OFF), { state: 'light' });
  assert.equal(alarmStatePatch('anything-else'), null);
});

function alarmsDouble() {
  const created = []; const cleared = []; let clearedAll = 0;
  return {
    created, cleared,
    get clearedAll() { return clearedAll; },
    create: (name, opts) => created.push({ name, when: opts.when }),
    clear: (name, cb) => { cleared.push(name); cb?.(true); },
    clearAll: (cb) => { clearedAll++; cb?.(true); },
  };
}
const settings = (over = {}) => ({ schedule: { enabled: true, onTime: '20:00', offTime: '07:00', ...over } });

test('syncAlarms enabled: clears both names then creates one-shot alarms for set times (§3.2)', () => {
  const d = alarmsDouble();
  syncAlarms(settings(), d);
  assert.deepEqual(d.cleared.sort(), [ALARM_OFF, ALARM_ON]);
  assert.equal(d.created.length, 2);
  assert.ok(d.created.every((a) => typeof a.when === 'number' && a.when > 0));
});

test('syncAlarms: empty time → that direction is simply not created (§3.3)', () => {
  const d = alarmsDouble();
  syncAlarms(settings({ offTime: '' }), d);
  assert.equal(d.created.length, 1);
  assert.equal(d.created[0].name, ALARM_ON);
});

test('syncAlarms disabled: clearAll only', () => {
  const d = alarmsDouble();
  syncAlarms(settings({ enabled: false }), d);
  assert.equal(d.clearedAll, 1);
  assert.equal(d.created.length, 0);
});

test('syncAlarms: no alarms API (permission absent) is a no-op', () => {
  assert.doesNotThrow(() => syncAlarms(settings(), undefined));
});
