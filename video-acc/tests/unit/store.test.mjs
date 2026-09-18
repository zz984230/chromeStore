// tests/unit/store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, DEFAULT_SETTINGS, loadSettings, saveSettings, subscribeSettings } from '../../src/shared/store.js';

// chrome.storage.local 形状的内存适配器
class MemoryStorage {
  constructor(initial = {}) { this.data = structuredClone(initial); this.listeners = new Set(); }
  get(key, cb) { cb(key in this.data ? { [key]: this.data[key] } : {}); }
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

test('loadSettings 空库返回默认，缺字段回填', async () => {
  assert.deepEqual(await loadSettings(new MemoryStorage()), DEFAULT_SETTINGS);
  const partial = new MemoryStorage({ [STORAGE_KEY]: {} });
  assert.deepEqual(await loadSettings(partial), { pace: 1, hold: false, heldPace: 1 });
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

test('schema 升级：旧存储缺 hold/heldPace 回填默认', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 2 } });
  const s = await loadSettings(mem);
  assert.equal(s.pace, 2);
  assert.equal(s.hold, false);
  assert.equal(s.heldPace, 1);
});

test('subscribeSettings 派发本键变更并支持退订', async () => {
  const mem = new MemoryStorage();
  const seen = [];
  const off = subscribeSettings((s) => seen.push(s), mem);
  await saveSettings({ hold: true, heldPace: 2 }, mem);
  off();
  await saveSettings({ pace: 3 }, mem);
  assert.equal(seen.length, 1, '退订后不再派发');
  assert.equal(seen[0].hold, true);
  assert.equal(seen[0].heldPace, 2);
  assert.equal(seen[0].pace, 1, '回填默认字段');
});

test('跨上下文策略：两个模块实例共享同一存储，顺序写均存活', async () => {
  // 模拟 popup 与 service worker 两个上下文：同后备存储、各自独立 writeChain。
  // 策略：读-合-写在毫秒窗内交错时接受最后写者胜（v1 与 nightveil 同策略）；
  // 本测试锁住可测部分——顺序到达的跨实例写互不整键覆盖。
  const shared = new MemoryStorage({ [STORAGE_KEY]: { pace: 1, hold: false, heldPace: 1 } });
  const ctxA = await import('../../src/shared/store.js');
  const ctxB = await import('../../src/shared/store.js?ctx=background');
  await ctxA.saveSettings({ hold: true, heldPace: 1.5 }, shared);
  await ctxB.saveSettings({ pace: 2 }, shared);
  const s = await ctxA.loadSettings(shared);
  assert.equal(s.hold, true, 'A 的字段存活');
  assert.equal(s.heldPace, 1.5);
  assert.equal(s.pace, 2, 'B 的字段存活');
});

test('subscribeSettings 忽略外键变更', async () => {
  const mem = new MemoryStorage();
  const seen = [];
  subscribeSettings((s) => seen.push(s), mem);
  const listeners = [...mem.listeners];
  listeners[0]({ 'some.other.key': { newValue: 1 } }, 'local');
  assert.equal(seen.length, 0, '外键变更不派发');
});
