// tests/shell/strings-source.test.mjs — 装配 manifest ↔ 壳文案 ↔ 静态页 三方一致
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assembleManifest } from '../../scripts/manifest.mjs';
import { TOOLS } from '../../src/tools/registry.js';
import { SHELL_STRINGS } from '../../src/shell/strings.js';

test('装配 manifest 与壳文案一致;静态页 title 跟随', () => {
  const m = assembleManifest(TOOLS, { version: '0.1.0' });
  assert.equal(m.name, SHELL_STRINGS.extensionName);
  assert.equal(m.description, SHELL_STRINGS.extensionDescription);
  const optionsHtml = readFileSync(new URL('../../public/options.html', import.meta.url), 'utf8');
  const popupHtml = readFileSync(new URL('../../public/popup.html', import.meta.url), 'utf8');
  assert.ok(optionsHtml.includes(`<title>${SHELL_STRINGS.extensionName}</title>`));
  assert.ok(popupHtml.includes(`<title>${SHELL_STRINGS.extensionName}</title>`));
  assert.ok(popupHtml.includes(`>${SHELL_STRINGS.popupTabVeil}</button>`));
  assert.ok(popupHtml.includes(`>${SHELL_STRINGS.popupTabPace}</button>`));
});
