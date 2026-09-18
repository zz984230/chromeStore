// tests/unit/background.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { wireBackground } from '../../src/background/main.js';
import { STORAGE_KEY } from '../../src/shared/store.js';
import { APPLY_PACE } from '../../src/shared/protocol.js';

class MemoryStorage {
  constructor(initial = {}) { this.data = structuredClone(initial); }
  get(key, cb) { cb(key in this.data ? { [key]: this.data[key] } : {}); }
  set(obj, cb) { Object.assign(this.data, obj); cb(); }
}
function fakeCommands() {
  const handlers = [];
  return { handlers, onCommand: { addListener: (fn) => handlers.push(fn) } };
}

test('pace-up 以存储档位为基步进并推送活动页', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 1 } });
  const commands = fakeCommands();
  const sent = [];
  wireBackground({
    commands, storage: mem,
    tabsApi: { query: async () => [{ id: 9 }], sendMessage: async (id, m) => sent.push({ id, m }) },
    version: '0.1.0', log: () => {},
  });
  await commands.handlers[0]('pace-up');
  assert.equal(mem.data[STORAGE_KEY].pace, 1.25);
  assert.deepEqual(sent, [{ id: 9, m: { vpa: APPLY_PACE, pace: 1.25 } }]);
});

test('pace-down 与边界饱和', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 0.07 } });
  const commands = fakeCommands();
  wireBackground({ commands, storage: mem, tabsApi: { query: async () => [{}] }, version: '0.1.0', log: () => {} });
  await commands.handlers[0]('pace-down');
  assert.equal(mem.data[STORAGE_KEY].pace, 0.07, '下界饱和');
});

test('pace-normal 回正到 1', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 3 } });
  const commands = fakeCommands();
  wireBackground({ commands, storage: mem, tabsApi: { query: async () => [{}] }, version: '0.1.0', log: () => {} });
  await commands.handlers[0]('pace-normal');
  assert.equal(mem.data[STORAGE_KEY].pace, 1);
});

test('未知命令忽略', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 1 } });
  const commands = fakeCommands();
  wireBackground({ commands, storage: mem, tabsApi: { query: async () => { throw new Error('不应发生'); } }, version: '0.1.0', log: () => {} });
  await commands.handlers[0]('something-else');
  assert.equal(mem.data[STORAGE_KEY].pace, 1);
});

test('hold-toggle 开启记忆当前档位并写存储', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 2, hold: false, heldPace: 1 } });
  const commands = fakeCommands();
  const sent = [];
  wireBackground({
    commands, storage: mem,
    tabsApi: { query: async () => [{ id: 9 }], sendMessage: async (id, m) => sent.push({ id, m }) },
    version: '0.1.0', log: () => {},
  });
  await commands.handlers[0]('hold-toggle');
  assert.equal(mem.data[STORAGE_KEY].hold, true);
  assert.equal(mem.data[STORAGE_KEY].heldPace, 2, '记忆 = 当前档位');
  assert.deepEqual(sent, [], '保持状态走 storage 总线，不直推');
});

test('hold-toggle 再次触发关闭，heldPace 保留', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 2, hold: true, heldPace: 2 } });
  const commands = fakeCommands();
  wireBackground({ commands, storage: mem, tabsApi: { query: async () => [{}] }, version: '0.1.0', log: () => {} });
  await commands.handlers[0]('hold-toggle');
  assert.equal(mem.data[STORAGE_KEY].hold, false);
  assert.equal(mem.data[STORAGE_KEY].heldPace, 2, '关闭不清记忆');
});
