// src/shell/store.js — 壳存储:oct. 命名空间(Q4 当前工具持久化)。工具命名空间不经此。
const KEY = 'oct.shell';
const DEFAULTS = Object.freeze({ activeTool: 'veil' });
const IDS = new Set(['veil', 'pace']); // 与 registry 同步;M0 硬编码,第三个工具时改由 registry 注入

function merge(found) {
  const patch = found?.[KEY];
  return { ...DEFAULTS, ...(patch && typeof patch === 'object' ? patch : {}) };
}

export function loadShell(storage = globalThis.chrome?.storage?.local) {
  return new Promise((resolve, reject) => {
    if (!storage) { reject(new Error('chrome.storage.local unavailable')); return; }
    storage.get(KEY, (found) => resolve(merge(found)));
  });
}

export function saveShellPatch(patch, storage = globalThis.chrome?.storage?.local) {
  return new Promise((resolve, reject) => {
    if (!storage) { reject(new Error('chrome.storage.local unavailable')); return; }
    for (const k of Object.keys(patch ?? {})) if (!IDS.has(patch[k]) || k !== 'activeTool') {
      reject(new Error(`invalid shell patch: ${k}`)); return;
    }
    storage.get(KEY, (found) => {
      const next = merge(found);
      next.activeTool = patch.activeTool;
      storage.set({ [KEY]: next }, () => resolve(next));
    });
  });
}
