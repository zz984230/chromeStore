// src/shared/settings.js
// Single-object settings store. All extension contexts read/write this shape;
// no request-response messaging is used for state — storage.onChanged is the bus.
// Writers (background toolbar/menu, options page) serialize through writeChain
// per context; cross-context last-writer-wins remains possible (v1 accepted —
// the two writers touch mostly disjoint fields, see M1b plan).
const STORAGE_KEY_VALUE = 'nightveil.settings';

export const STORAGE_KEY = STORAGE_KEY_VALUE;

export const DEFAULT_SETTINGS = Object.freeze({
  state: 'light',          // 'light' | 'dark'
  themeId: 'nv-simple',    // palettes.js id
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
