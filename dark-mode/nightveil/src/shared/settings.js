// src/shared/settings.js
// Single-object settings store. All extension contexts read/write this shape;
// no request-response messaging is used for state — storage.onChanged is the bus.
// Writers (background toolbar/menu, options page) serialize through writeChain
// per context; cross-context last-writer-wins remains possible (v1 accepted —
// the two writers touch mostly disjoint fields, see M1b plan).
import { engineDefaults } from '../content/engine/contract.js';

const STORAGE_KEY_VALUE = 'nightveil.settings';

export const STORAGE_KEY = STORAGE_KEY_VALUE;

export const DEFAULT_SETTINGS = Object.freeze({
  state: 'light',          // 'light' | 'dark'
  themeId: 'adaptive',     // engine seat — factory default (M2-BEHAVIOR §11 拍板 1)
  inclusionMode: false,    // false = exclusion semantics; true = only listed sites
  perSiteToggle: false,    // inclusion mode + true → toolbar click edits inclusionList
  exclusionList: [],       // hostnames; an entry covers itself and its subdomains
  inclusionList: [],
  disabledSiteThemes: [],  // siteThemes.js ids with the refinement layer off
  exclusionRules: {
    metaScheme: true,               // skip pages declaring a dark color-scheme
    darkBackground: false,          // skip pages whose own bg is already dark
    brightnessThreshold: 50,        // 0-255 luma cut for darkBackground
    htmlAttributes: 'data-theme=dark', // comma list; bare name or name=value on <html>
    htmlClasses: 'dark,darkmode',      // comma list matched against <html> classes
    cookies: '',                       // comma list of cookie names
  },
  engine: engineDefaults(),
  // ---- M3（plan 2026-09-19-m3-full-options；M3-BEHAVIOR §8）----
  userCss: '',                // themeId 'custom' 席位的样式文本
  documentRoot: false,        // true → 样式元素挂 documentElement 而非 head
  reattachStyles: true,       // 引擎重扫时重挂被删的引擎元素（§5.3）
  colorTemperature: { enabled: false, red: 255, green: 227, blue: 199, opacity: 100, excludedHosts: [] },
  flashGuard: { enabled: true, mode: 'simple-dark', delayMs: 200, threshold: 1000 },
  schedule: { enabled: false, onTime: '', offTime: '' },
  ui: {
    fontSize: 13,
    // M3+：唯一可折叠区是 #sec-advanced；旧七键（themes/engine/…）在已存设置里
    // 经深合并无害残留，不做迁移。
    sectionOpen: { advanced: false },
  },
});

export function defaultStorage() {
  const cs = globalThis.chrome?.storage?.local;
  if (!cs) throw new Error('chrome.storage.local unavailable — pass a storage adapter');
  return cs;
}

const NESTED_GROUPS = ['exclusionRules', 'engine', 'colorTemperature', 'flashGuard', 'schedule', 'ui'];
// Engine sub-groups the M2c options UI writes partially: stored subgroup
// objects deep-merge over defaults (second level) so sibling fields backfill.
// exclusionRules stays one-level by design.
const NESTED_SUBGROUPS = {
  engine: ['darken', 'fallback', 'alphaRange', 'luminanceRange', 'nearWhiteAdjust', 'contextAwareTargets', 'variables'],
  ui: ['sectionOpen'],
};
function mergeWithDefaults(stored) {
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  for (const group of NESTED_GROUPS) {
    merged[group] = { ...DEFAULT_SETTINGS[group], ...(stored?.[group] ?? {}) };
    for (const sub of NESTED_SUBGROUPS[group] ?? []) {
      merged[group][sub] = { ...DEFAULT_SETTINGS[group][sub], ...(stored?.[group]?.[sub] ?? {}) };
    }
  }
  return merged;
}

export async function loadSettings(storage = defaultStorage()) {
  return await new Promise((resolve) => {
    storage.get(STORAGE_KEY_VALUE, (found) => {
      resolve(mergeWithDefaults(found?.[STORAGE_KEY_VALUE]));
    });
  });
}

let writeChain = Promise.resolve();
export async function saveSettings(patch, storage = defaultStorage()) {
  const run = writeChain.then(async () => {
    const merged = mergeWithDefaults({ ...(await loadSettings(storage)), ...patch });
    return await new Promise((resolve) => {
      storage.set({ [STORAGE_KEY_VALUE]: merged }, () => resolve(merged));
    });
  });
  writeChain = run.catch(() => {});
  return run;
}

export function subscribeSettings(callback, storage = defaultStorage()) {
  const listener = (changes) => {
    const change = changes?.[STORAGE_KEY_VALUE];
    if (change?.newValue) callback(mergeWithDefaults(change.newValue));
  };
  storage.onChanged.addListener(listener);
  return () => storage.onChanged.removeListener(listener);
}
