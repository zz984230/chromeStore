// src/shared/notify.js — 把新档位推给当前活动标签页，带回内容脚本的确认回包
import { APPLY_PACE, RUN_ADVANCE } from './protocol.js';

export async function nudgeActiveTab(pace, tabsApi = globalThis.chrome?.tabs) {
  if (!tabsApi) return null;
  try {
    const [tab] = await tabsApi.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    return (await tabsApi.sendMessage(tab.id, { vpa: APPLY_PACE, pace })) ?? null;
  } catch {
    return null; // 受限页 / 内容脚本未注入
  }
}

// 手动续播：推 advance.run 到活动标签页（不受 autoAdvance 总开关限制）
export async function pushAdvanceNow(tabsApi = globalThis.chrome?.tabs) {
  if (!tabsApi) return false;
  try {
    const [tab] = await tabsApi.query({ active: true, currentWindow: true });
    if (!tab?.id) return false;
    await tabsApi.sendMessage(tab.id, { vpa: RUN_ADVANCE });
    return true;
  } catch {
    return false; // 受限页 / 内容脚本未注入
  }
}
