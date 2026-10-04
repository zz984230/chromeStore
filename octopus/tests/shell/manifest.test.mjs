// tests/shell/manifest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleManifest } from '../../scripts/manifest.mjs';
import { TOOLS } from '../../src/tools/registry.js';
import { SHELL_STRINGS } from '../../src/shell/strings.js';

const m = assembleManifest(TOOLS, { version: '0.1.0' });

test('基座字段:名称/描述来自壳文案,版本透传', () => {
  assert.equal(m.manifest_version, 3);
  assert.equal(m.name, SHELL_STRINGS.extensionName);
  assert.equal(m.description, SHELL_STRINGS.extensionDescription);
  assert.equal(m.version, '0.1.0');
  assert.deepEqual(m.background, { service_worker: 'background.js' });
  assert.equal(m.options_ui.page, 'options.html');
  assert.equal(m.action.default_popup, 'popup.html');
});

test('权限并集去重且精确:storage+contextMenus,可选 alarms,无 activeTab', () => {
  assert.deepEqual(m.permissions, ['storage', 'contextMenus']);
  assert.deepEqual(m.optional_permissions, ['alarms']);
  assert.deepEqual(m.host_permissions, ['<all_urls>']); // 仅 veil 申报(SW 跨域代取)
});

test('content_scripts 两条 entry 按注册顺序,逐字段保真', () => {
  assert.equal(m.content_scripts.length, 2);
  const [veil, pace] = m.content_scripts;
  assert.equal(veil.js[0], 'tools/veil/content.js');
  assert.equal(veil.run_at, 'document_start');
  assert.equal(veil.match_about_blank, true);
  assert.equal(veil.all_frames, true);
  assert.equal(pace.js[0], 'tools/pace/content.js');
  assert.deepEqual(pace.css, ['tools/pace/content.css']);
  assert.equal(pace.run_at, 'document_idle');
  assert.equal(pace.match_about_blank, undefined);
});

test('commands 7 条合并,WAR 仅 veil 一项', () => {
  assert.equal(Object.keys(m.commands).length, 7);
  assert.equal(m.commands['hold-toggle'].suggested_key.default, 'Alt+L');
  assert.equal(m.web_accessible_resources.length, 1);
  assert.deepEqual(m.web_accessible_resources[0].resources, ['tools/veil/nv-shadow-hook.js']);
});
