// tests/build.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

test('build produces a complete loadable extension directory', () => {
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const files = [
    'extension/manifest.json',
    'extension/background.js',
    'extension/content.js',
    'extension/options.js',
    'extension/options.html',
    'extension/icons/toolbar/16.png',
    'extension/icons/dark/128.png',
  ];
  for (const f of files) assert.ok(existsSync(f), `missing ${f}`);

  const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'NightVeil');
  assert.deepEqual(manifest.permissions, ['storage', 'contextMenus']);
  assert.deepEqual(manifest.optional_permissions, ['alarms']);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.equal(manifest.action.default_popup, undefined, 'no popup by design');
});
