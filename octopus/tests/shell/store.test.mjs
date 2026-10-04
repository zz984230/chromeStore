// tests/shell/store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, saveShellPatch } from '../../src/shell/store.js';

function memoryStorage(initial = {}) {
  const state = { ...initial };
  return {
    get(key, cb) { cb({ [key]: state[key] }); },
    set(obj, cb) { Object.assign(state, obj); cb(); },
  };
}

test('默认态:activeTool = veil', async () => {
  assert.deepEqual(await loadShell(memoryStorage()), { activeTool: 'veil' });
});

test('补丁写入并回读;非法工具 id 拒绝', async () => {
  const storage = memoryStorage();
  await saveShellPatch({ activeTool: 'pace' }, storage);
  assert.deepEqual(await loadShell(storage), { activeTool: 'pace' });
  await assert.rejects(() => saveShellPatch({ activeTool: 'x' }, storage));
});

test('无 storage 时给出可捕获错误(popup 预览模式由调用方兜底)', async () => {
  await assert.rejects(() => loadShell(undefined));
});
