// tests/shell/zip.test.mjs — 打包链钉子:包根=manifest、关键 entry 在位、无点文件
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
execFileSync('npm', ['run', 'zip'], { cwd: root, stdio: 'ignore' });
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const listing = execFileSync('unzip', ['-l', path.join(root, 'dist', `octopus-${version}.zip`)], { encoding: 'utf8' });

test('zip:manifest 在包根,无 extension/ 前缀,无点文件', () => {
  assert.match(listing, / manifest\.json$/m);
  assert.doesNotMatch(listing, / extension\//);
  assert.doesNotMatch(listing, /\.DS_Store/);
});

test('zip:六入口 + 章鱼图标在位', () => {
  for (const f of ['background.js', 'popup.html', 'options.html', 'tools/veil/content.js', 'tools/pace/content.js', 'diff.js', 'diff.html', 'icons/toolbar/128.png']) {
    assert.match(listing, new RegExp(` ${f.replace(/\./g, '\\.')}$`, 'm'), f);
  }
});

test('zip:产出 dist/octopus-<version>.zip', () => {
  assert.ok(existsSync(path.join(root, 'dist', `octopus-${version}.zip`)));
});
