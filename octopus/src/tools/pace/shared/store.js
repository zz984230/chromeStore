// src/shared/store.js — 单键设置存储：缺字段回填 + 同上下文写入串行
// nightveil settings.js 家族模式；键名与 schema 属本项目自有（vpa.settings 单键对象，
// 载入缺字段回填并随里程碑生长：M2 pace → M3 hold/heldPace → M4 introSkip/outroSkip/skipOn/autoAdvance 均已入默认）。
export const STORAGE_KEY = 'vpa.settings';

export const DEFAULT_SETTINGS = Object.freeze({
  pace: 1,        // 当前档位
  hold: false,    // 保持模式（M3）
  heldPace: 1,    // 记忆档位（M3）
  introSkip: 0,   // 片头跳过秒数（M4）
  outroSkip: 0,   // 片尾跳过秒数（M4）
  skipOn: false,  // 跳过总开关（M4）
  autoAdvance: false, // 自动续播开关（M4）
});

function defaultStorage() {
  const cs = globalThis.chrome?.storage?.local;
  if (!cs) throw new Error('chrome.storage.local 不可用 —— 请传入存储适配器');
  return cs;
}

function mergeWithDefaults(stored) {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function loadSettings(storage = defaultStorage()) {
  return await new Promise((resolve) => {
    storage.get(STORAGE_KEY, (found) => {
      resolve(mergeWithDefaults(found?.[STORAGE_KEY]));
    });
  });
}

let writeChain = Promise.resolve();
export async function saveSettings(patch, storage = defaultStorage()) {
  const run = writeChain.then(async () => {
    const merged = mergeWithDefaults({ ...(await loadSettings(storage)), ...patch });
    return await new Promise((resolve, reject) => {
      storage.set({ [STORAGE_KEY]: merged }, () => {
        const err = globalThis.chrome?.runtime?.lastError;
        if (err) reject(new Error(err?.message || err || 'storage.set 失败'));
        else resolve(merged);
      });
    });
  });
  writeChain = run.catch(() => {});
  return run;
}

// 订阅本键变更（storage.onChanged 总线）；返回退订函数。
// content 侧用于保持状态同步——content 从不写存储，收到的都是跨上下文变更。
export function subscribeSettings(callback, storage = defaultStorage()) {
  const listener = (changes) => {
    const change = changes?.[STORAGE_KEY];
    if (change?.newValue) callback(mergeWithDefaults(change.newValue));
  };
  storage.onChanged.addListener(listener);
  return () => storage.onChanged.removeListener(listener);
}
