// src/shared/skipPlan.js — 片头/片尾跳过的纯决策函数（行为规格见 M4 计划全局约束）
export const SKIP_CEILING = 3600; // 跳过秒数上限（防误填）
export const INTRO_TUNING = 5;    // 快捷键片头调整步长

export function clampSkip(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return 0;
  return Math.min(SKIP_CEILING, Math.max(0, Math.round(n * 10) / 10));
}

// 片头：开始播放时若位置仍落在片头区间内，返回应跳到的目标秒数；否则 null
export function introSeekTarget({ position, introSkip }) {
  if (!(introSkip > 0) || !(position >= 0)) return null;
  return position < introSkip ? introSkip : null;
}

// 片尾：剩余时间进入片尾区间时的处置——循环视频暂停原地，普通视频跳到结尾触发自然结束
export function outroAction({ remaining, loop, outroSkip }) {
  if (!(outroSkip > 0) || !(remaining >= 0)) return null;
  if (remaining < outroSkip) return loop ? 'pause' : 'toEnd';
  return null;
}

// 快捷键片头 ±N 秒：调到 >0 自动启用跳过
export function retuneIntro(current, delta) {
  const introSkip = clampSkip((Number(current) || 0) + delta);
  return { introSkip, skipOn: introSkip > 0 };
}
