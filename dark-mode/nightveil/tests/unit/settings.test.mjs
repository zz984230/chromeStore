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
  assert.deepEqual(await loadSettings(partial), { state: 'light', themeId: 'nv-midnight' });
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
