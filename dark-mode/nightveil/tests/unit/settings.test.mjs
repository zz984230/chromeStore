// tests/unit/settings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, DEFAULT_SETTINGS, loadSettings, saveSettings, subscribeSettings } from '../../src/shared/settings.js';

// chrome.storage.local 形状的内存适配器
class MemoryStorage {
  constructor(initial = {}) { this.data = {...initial}; this.listeners = new Set(); }
  get(keys, cb) {
    const want = typeof keys === 'string' ? [keys] : keys;
    const out = {};
    for (const k of want) if (k in this.data) out[k] = this.data[k];
    cb(out);
  }
  set(obj, cb) {
    Object.assign(this.data, obj);
    const changes = {};
    for (const k of Object.keys(obj)) changes[k] = { newValue: obj[k] };
    for (const l of this.listeners) l(changes, 'local');
    cb();
  }
  get onChanged() {
    return { addListener: (l) => this.listeners.add(l), removeListener: (l) => this.listeners.delete(l) };
  }
}

test('loadSettings returns defaults for missing key and fills missing fields', async () => {
  const mem = new MemoryStorage();
  assert.deepEqual(await loadSettings(mem), DEFAULT_SETTINGS);
  const partial = new MemoryStorage({ [STORAGE_KEY]: { themeId: 'nv-midnight' } });
  assert.deepEqual(await loadSettings(partial), { ...DEFAULT_SETTINGS, themeId: 'nv-midnight' });
});

test('legacy M1a settings object upgrades to full v2 defaults', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { state: 'dark', themeId: 'nv-coffee' } });
  const s = await loadSettings(mem);
  assert.equal(s.state, 'dark');
  assert.equal(s.inclusionMode, false);
  assert.deepEqual(s.exclusionList, []);
  assert.equal(s.exclusionRules.metaScheme, true);
});

test('saveSettings serializes concurrent writers within a context', async () => {
  const mem = new MemoryStorage();
  await Promise.all([
    saveSettings({ state: 'dark' }, mem),
    saveSettings({ themeId: 'nv-owl' }, mem),
  ]);
  const s = await loadSettings(mem);
  assert.equal(s.state, 'dark', 'first concurrent write was lost');
  assert.equal(s.themeId, 'nv-owl');
});

test('saveSettings shallow-merges patch, persists, and returns merged settings', async () => {
  const mem = new MemoryStorage();
  const after = await saveSettings({ state: 'dark' }, mem);
  assert.equal(after.state, 'dark');
  assert.equal(after.themeId, DEFAULT_SETTINGS.themeId);
  const reread = await loadSettings(mem);
  assert.deepEqual(reread, after);
});

test('subscribeSettings fires with new settings on our key only and can be cancelled', async () => {
  const mem = new MemoryStorage();
  const seen = [];
  const off = subscribeSettings((s) => seen.push(s), mem);
  await saveSettings({ state: 'dark' }, mem);
  mem.set({ 'someone.else': 1 }, () => {});
  off();
  await saveSettings({ state: 'light' }, mem);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].state, 'dark');
});

test('engine settings default and one-level deep merge for nested groups', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { engine: { highPriority: true } } });
  const s = await loadSettings(mem);
  assert.equal(s.themeId, 'adaptive', 'factory default theme is the engine seat');
  assert.equal(s.engine.highPriority, true, 'stored override wins');
  assert.equal(s.engine.siteThemePolicy, 'skip-compatible', 'missing fields backfill');
  assert.equal(s.engine.luminanceRange.max, 75);
  assert.deepEqual(s.engine.variables['--nv-surface'], '#292929');
});

test('engine known subgroups two-level merge: partial stored variables backfills the rest', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { engine: { variables: { '--nv-surface': '#101010' } } } });
  const s = await loadSettings(mem);
  assert.equal(s.engine.variables['--nv-surface'], '#101010', 'stored override wins');
  assert.equal(s.engine.variables['--nv-text'], '#dcdcdc', 'other variable defaults backfill');
  assert.equal(Object.keys(s.engine.variables).length, 18, 'full variable set intact');
});

test('engine known subgroups two-level merge: partial stored darken backfills siblings', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { engine: { darken: { text: false } } } });
  const s = await loadSettings(mem);
  assert.equal(s.engine.darken.text, false, 'stored override wins');
  assert.equal(s.engine.darken.border, true, 'missing darken fields backfill');
});

test('exclusionRules stays one-level merge: unknown subgroup keys pass through untouched', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { exclusionRules: { htmlClasses: 'x' } } });
  const s = await loadSettings(mem);
  assert.equal(s.exclusionRules.htmlClasses, 'x', 'stored override wins');
  assert.equal(s.exclusionRules.htmlAttributes, 'data-theme=dark', 'sibling default preserved');
});

test('legacy full-engine-absent settings upgrade keeps exclusionRules backfill', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { state: 'dark', themeId: 'nv-midnight' } });
  const s = await loadSettings(mem);
  assert.equal(s.engine.contextAware, true);
  assert.equal(s.exclusionRules.metaScheme, true);
});
