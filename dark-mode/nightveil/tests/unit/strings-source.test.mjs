// tests/unit/strings-source.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../../src/shared/strings.js';

const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));
const optionsMain = readFileSync(new URL('../../src/options/main.js', import.meta.url), 'utf8');

test('static files and STRINGS agree on shared copy (single source of truth)', () => {
  assert.equal(manifest.name, STRINGS.extensionName);
  assert.equal(manifest.description, STRINGS.extensionDescription);
  const optionsHtml = readFileSync(new URL('../../public/options.html', import.meta.url), 'utf8');
  assert.ok(optionsHtml.includes(`<title>${STRINGS.extensionName}</title>`), 'options.html title must match STRINGS.extensionName');
});

test('options main.js only references STRINGS keys that exist', () => {
  const used = [...optionsMain.matchAll(/STRINGS\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  assert.ok(used.length > 20, 'expected the options page to pull its copy from STRINGS');
  for (const key of new Set(used)) {
    assert.ok(key in STRINGS, `STRINGS.${key} referenced by options main.js must exist`);
  }
});

test('engine section copy: real note replaces the placeholder, seat/policy/group strings present', () => {
  const expected = [
    'engineSeatLabel',
    'enginePolicyRespectLabel', 'enginePolicyIgnoreLabel', 'enginePolicySkipCompatibleLabel',
    'enginePolicyNote',
    'engineColorsGroupLabel', 'engineBackgroundsGroupLabel', 'engineRulesGroupLabel',
    'engineScopeGroupLabel', 'engineSitePolicyGroupLabel', 'enginePerformanceGroupLabel',
  ];
  for (const key of expected) {
    assert.equal(typeof STRINGS[key], 'string', `missing STRINGS.${key}`);
    assert.ok(STRINGS[key].length > 0, `empty STRINGS.${key}`);
  }
  assert.ok(!/later milestone/.test(STRINGS.sectionEngineNote),
    'sectionEngineNote must be real copy now — the placeholder text is retired');
});
