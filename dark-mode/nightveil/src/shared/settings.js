// src/shared/settings.js
// Single-object settings store. All extension contexts read/write this shape;
// no request-response messaging is used for state — storage.onChanged is the bus.
const STORAGE_KEY_VALUE = 'nightveil.settings';

export const STORAGE_KEY = STORAGE_KEY_VALUE;

export const DEFAULT_SETTINGS = Object.freeze({
  state: 'light',       // 'light' | 'dark'
  themeId: 'nv-simple', // palettes.js id
});

export function defaultStorage() {
  const cs = globalThis.chrome?.storage?.local;
  if (!cs) throw new Error('chrome.storage.local unavailable — pass a storage adapter');
  return cs;
}

function mergeWithDefaults(stored) {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function loadSettings(storage = defaultStorage()) {
  return await new Promise((resolve) => {
    storage.get(STORAGE_KEY_VALUE, (found) => {
      resolve(mergeWithDefaults(found?.[STORAGE_KEY_VALUE]));
    });
  });
}

export async function saveSettings(patch, storage = defaultStorage()) {
  const merged = mergeWithDefaults({ ...(await loadSettings(storage)), ...patch });
  return await new Promise((resolve) => {
    storage.set({ [STORAGE_KEY_VALUE]: merged }, () => resolve(merged));
  });
}

export function subscribeSettings(callback, storage = defaultStorage()) {
  const listener = (changes) => {
    const change = changes?.[STORAGE_KEY_VALUE];
    if (change?.newValue) callback(mergeWithDefaults(change.newValue));
  };
  storage.onChanged.addListener(listener);
  return () => storage.onChanged.removeListener(listener);
}
