// src/shared/protocol.js — 弹窗/后台 → 内容脚本的窄消息协议
export const APPLY_PACE = 'pace.apply'; // { vpa: APPLY_PACE, pace } → { ok, pace }
export const PROBE_PACE = 'probe';      // { vpa: PROBE_PACE } → { pace: number | null }
export const RUN_ADVANCE = 'advance.run'; // { vpa: RUN_ADVANCE } → { ok: boolean }
