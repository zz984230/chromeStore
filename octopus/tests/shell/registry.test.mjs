// tests/shell/registry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolById } from '../../src/tools/registry.js';

test('注册表含 veil/pace/diff,id 唯一且契约字段齐全', () => {
  const ids = TOOLS.map((t) => t.id);
  assert.deepEqual([...ids].sort(), ['diff', 'pace', 'veil']);
  assert.equal(new Set(ids).size, ids.length, 'id 必须唯一');
  for (const t of TOOLS) {
    for (const key of ['permissions', 'optionalPermissions', 'hostPermissions', 'contentScripts', 'webAccessibleResources', 'commands']) {
      assert.ok(Array.isArray(t.manifest[key]) || typeof t.manifest[key] === 'object', `${t.id}.${key} 必须声明`);
    }
    // 工具形态二分(CONTEXT.md):注入型必有 content 注入,工作台型必有工作页
    assert.ok(t.manifest.contentScripts.length >= 1 || t.workPage, `${t.id} 必须有 content 注入或工作页`);
  }
  assert.equal(toolById('veil').id, 'veil');
  assert.equal(toolById('nope'), null);
});
