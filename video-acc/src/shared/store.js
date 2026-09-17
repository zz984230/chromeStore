// src/shared/store.js — 单键设置存储：缺字段回填 + 同上下文写入串行
// nightveil settings.js 家族模式；键名与 schema 属本项目自有（vpa.settings / {pace}）。
export const STORAGE_KEY = 'vpa.settings';

export const DEFAULT_SETTINGS = Object.freeze({
  pace: 1, // 当前档位（M2 唯一字段；hold/跳过/续播随里程碑增补，靠回填升级）
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
