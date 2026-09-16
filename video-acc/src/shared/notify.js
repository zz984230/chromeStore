// src/shared/notify.js — 把新档位推给当前活动标签页
import { APPLY_PACE } from './protocol.js';

export async function nudgeActiveTab(pace, tabsApi = globalThis.chrome?.tabs) {
  if (!tabsApi) return false;
  try {
    const [tab] = await tabsApi.query({ active: true, currentWindow: true });
    if (!tab?.id) return false;
    await tabsApi.sendMessage(tab.id, { vpa: APPLY_PACE, pace });
    return true;
  } catch {
    return false; // 受限页 / 内容脚本未注入
  }
}
