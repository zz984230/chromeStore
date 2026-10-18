// src/shared/paceMath.js — 档位数值与格式化（纯函数）
export const PACE_MIN = 0.07;
export const PACE_MAX = 16;
export const BUMP = 0.25;   // 快捷键步进（行为规格：0.25）
export const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const EPS = 1e-4;

// 修整两位小数并钳到 [PACE_MIN, PACE_MAX]；非有限值回正为 1
export function clampPace(value) {
  const n = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(n)) return 1;
  return Math.min(PACE_MAX, Math.max(PACE_MIN, n));
}

// dir ≥ 0 加一档、否则减一档（已钳制）
export function bumpPace(current, dir) {
  return clampPace((Number(current) || 1) + (dir >= 0 ? BUMP : -BUMP));
}

export function samePace(a, b) {
  return Math.abs(a - b) < EPS;
}

// 紧凑显示：整数不带小数点，小数最多两位
export function formatPace(value) {
  const n = clampPace(value);
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}×`;
}

// 跳过秒数步进(±5,与 manifest 命令「片头跳过 ±5 秒」一致),夹在 0–3600
// 注:先把 current 夹入界内再步进——负值脏数据 +5 落在首个步点(5),而非 2
export function stepSkip(current, delta, min = 0, max = 3600) {
  return Math.min(max, Math.max(min, Math.round(Math.max(min, current) + delta)));
}
