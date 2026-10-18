// src/shell/store.js — 壳存储:oct. 命名空间(Q4 当前工具 / M1 当前翼)。工具命名空间不经此。
const KEY = 'oct.shell';
const DEFAULTS = Object.freeze({ activeTool: 'veil', activeWing: 'veil' });
const IDS = new Set(['veil', 'pace']); // 与 registry 同步;M0 硬编码,第三个工具时改由 registry 注入
const WINGS = new Set(['veil', 'pace', 'gen']); // options 三翼;gen=通用(非工具)

function merge(found) {
  const patch = found?.[KEY];
  const s = { ...DEFAULTS, ...(patch && typeof patch === 'object' ? patch : {}) };
  if (!IDS.has(s.activeTool)) s.activeTool = 'veil';
  if (!WINGS.has(s.activeWing)) s.activeWing = 'veil';
  return s;
}

export function loadShell(storage = globalThis.chrome?.storage?.local) {
  return new Promise((resolve, reject) => {
    if (!storage) { reject(new Error('chrome.storage.local unavailable')); return; }
    storage.get(KEY, (found) => resolve(merge(found)));
  });
}

const PATCH_RULES = { activeTool: IDS, activeWing: WINGS };

export function saveShellPatch(patch, storage = globalThis.chrome?.storage?.local) {
  return new Promise((resolve, reject) => {
    if (!storage) { reject(new Error('chrome.storage.local unavailable')); return; }
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (!PATCH_RULES[k] || !PATCH_RULES[k].has(v)) {
        reject(new Error(`invalid shell patch: ${k}`)); return;
      }
    }
    storage.get(KEY, (found) => {
      const next = { ...merge(found), ...patch };
      storage.set({ [KEY]: next }, () => resolve(next));
    });
  });
}
