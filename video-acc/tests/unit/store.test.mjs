// tests/unit/store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/shared/store.js';

// chrome.storage.local 形状的内存适配器
class MemoryStorage {
  constructor(initial = {}) { this.data = structuredClone(initial); }
  get(key, cb) { cb(key in this.data ? { [key]: this.data[key] } : {}); }
  set(obj, cb) { Object.assign(this.data, obj); cb(); }
}

test('loadSettings 空库返回默认，缺字段回填', async () => {
  assert.deepEqual(await loadSettings(new MemoryStorage()), DEFAULT_SETTINGS);
  const partial = new MemoryStorage({ [STORAGE_KEY]: {} });
  assert.deepEqual(await loadSettings(partial), { pace: 1 });
});

test('saveSettings 浅合并补丁并持久化，返回合并结果', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 1 } });
  const merged = await saveSettings({ pace: 2 }, mem);
  assert.equal(merged.pace, 2);
  assert.deepEqual((await loadSettings(mem)).pace, 2);
});

test('saveSettings 并发写按到达顺序串行，无写丢失链断裂', async () => {
  const mem = new MemoryStorage();
  await Promise.all([
    saveSettings({ pace: 1.5 }, mem),
    saveSettings({ pace: 2 }, mem),
  ]);
  assert.equal((await loadSettings(mem)).pace, 2);
});

test('并发写不相交字段时两者都存活（判别串行化）', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 1 } });
  await Promise.all([
    saveSettings({ pace: 1.5 }, mem),
    saveSettings({ hold: true }, mem), // hold 字段 M3 才入默认，靠未知字段透传保留
  ]);
  const s = await loadSettings(mem);
  assert.equal(s.pace, 1.5, 'pace 写入存活');
  assert.equal(s.hold, true, 'hold 写入存活（无字段覆盖丢失）');
});

test('未知字段透传保留（为 M3/M4 字段演进预留）', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 1, hold: true } });
  assert.equal((await loadSettings(mem)).hold, true);
});

test('无 chrome.storage 且未注入适配器时抛错', async () => {
  await assert.rejects(() => loadSettings(), /storage/i);
});
