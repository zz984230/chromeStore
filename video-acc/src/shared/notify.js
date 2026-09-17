// src/shared/notify.js — 把新档位推给当前活动标签页，带回内容脚本的确认回包
import { APPLY_PACE } from './protocol.js';

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
