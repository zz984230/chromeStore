// src/shared/schedule.js
// 定时纯决策面（M3-BEHAVIOR §3）：一次性 when-alarm、今日/次日计算、触发即写
// state（与手动切换同链路）。无补判——跨重启补发交给 Chrome alarm 语义（§3.3）。
export const ALARM_ON = 'nv-schedule-on';
export const ALARM_OFF = 'nv-schedule-off';

const DAY_MS = 86400000;

export function nextAlarmTime(hhmm, now = Date.now()) {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  const d = new Date(now);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0).getTime();
  return at > now ? at : at + DAY_MS;
}

export function alarmStatePatch(name) {
  if (name === ALARM_ON) return { state: 'dark' };
  if (name === ALARM_OFF) return { state: 'light' };
  return null;
}

// settings 变化 / SW 启动时调用。alarms 缺省（未授权）→ no-op，镜像原版的
// `if (chrome.alarms)` 守卫。
export function syncAlarms(s, alarms = globalThis.chrome?.alarms) {
  if (!alarms || !s?.schedule) return;
  if (!s.schedule.enabled) { alarms.clearAll(); return; }
  const arm = (name, time) => {
    if (time === null) return;
    alarms.clear(name, () => alarms.create(name, { when: time }));
  };
  arm(ALARM_ON, nextAlarmTime(s.schedule.onTime));
  arm(ALARM_OFF, nextAlarmTime(s.schedule.offTime));
}
