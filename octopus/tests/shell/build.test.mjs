// tests/shell/build.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { toolById } from '../../src/tools/registry.js';

test('build produces a complete loadable extension directory', () => {
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const files = [
    'extension/manifest.json',
    'extension/background.js',
    'extension/popup.js',
    'extension/options.js',
    'extension/tools/veil/content.js',
    'extension/tools/pace/content.js',
    'extension/tools/veil/nv-shadow-hook.js',
    'extension/tools/pace/content.css',
  ];
  for (const f of files) assert.ok(existsSync(f), `missing ${f}`);

  const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Octopus');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.deepEqual(manifest.optional_permissions, ['alarms']);
  assert.equal(manifest.content_scripts.length, 2);
  assert.ok(!manifest.permissions.includes('activeTab'), 'activeTab 必须剪除(静态注入 + host_permissions 已覆盖,见 pace/tool.js 实证注释)');
  assert.deepEqual(
    Object.keys(manifest.commands).sort(),
    Object.keys(toolById('pace').manifest.commands).sort(),
    'commands 命令名集必须与 pace 契约一致'
  );
});
