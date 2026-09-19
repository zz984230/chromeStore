// tests/unit/actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hostnameFromUrl, menuClickPatch } from '../../src/shared/actions.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

test('hostnameFromUrl normalizes and rejects junk', () => {
  assert.equal(hostnameFromUrl('https://www.Example.com/x'), 'example.com');
  assert.equal(hostnameFromUrl('not a url'), null);
  assert.equal(hostnameFromUrl(null), null);
});

test('menuClickPatch adds the seen host to the active mode list, idempotently', () => {
  const p = menuClickPatch({ ...DEFAULT_SETTINGS, state: 'dark' }, 'https://gist.github.com/u/r');
  assert.deepEqual(p, { exclusionList: ['gist.github.com'] });
  assert.equal(menuClickPatch({ ...DEFAULT_SETTINGS, exclusionList: ['github.com'] }, 'https://gist.github.com/u/r'), null);
  const inc = menuClickPatch({ ...DEFAULT_SETTINGS, inclusionMode: true }, 'https://www.reddit.com/');
  assert.deepEqual(inc, { inclusionList: ['reddit.com'] });
  assert.equal(menuClickPatch(DEFAULT_SETTINGS, 'junk'), null);
});

// ---- M3 color-temperature menu (plan Task 9; M3-BEHAVIOR §1.4) ----
import { menuSpec } from '../../src/shared/actions.js';

test('menuSpec: light + colorTemperature on → color-temp mode (replaces exclude title)', () => {
  assert.equal(menuSpec({ state: 'light', inclusionMode: false, colorTemperature: { enabled: true } }).mode, 'color-temp');
});

test('menuSpec: light + colorTemperature off → site mode', () => {
  assert.equal(menuSpec({ state: 'light', inclusionMode: false, colorTemperature: { enabled: false } }).mode, 'site');
});

test('menuSpec: dark state never switches to color-temp (menu stays include/exclude)', () => {
  assert.equal(menuSpec({ state: 'dark', inclusionMode: false, colorTemperature: { enabled: true } }).mode, 'site');
  assert.equal(menuSpec({ state: 'dark', inclusionMode: true, colorTemperature: { enabled: true } }).mode, 'site');
});

test('menuClickPatch: color-temp mode appends exact hostname to colorTemperature.excludedHosts', () => {
  const s = { state: 'light', inclusionMode: false,
    colorTemperature: { enabled: true, red: 255, green: 227, blue: 199, opacity: 100, excludedHosts: ['a.com'] } };
  const patch = menuClickPatch(s, 'https://www.b.com/page');
  assert.deepEqual(patch.colorTemperature.excludedHosts, ['a.com', 'b.com']);
  assert.equal(patch.colorTemperature.enabled, true, '其余色温字段原样保留');
});

test('menuClickPatch: color-temp duplicate hostname → null (no-op)', () => {
  const s = { state: 'light', inclusionMode: false,
    colorTemperature: { enabled: true, excludedHosts: ['b.com'] } };
  assert.equal(menuClickPatch(s, 'https://b.com/'), null);
});

test('menuClickPatch: light + CT on still routes site lists? no — color-temp wins (§1.4)', () => {
  const s = { state: 'light', inclusionMode: false, exclusionList: ['x.com'],
    colorTemperature: { enabled: true, excludedHosts: [] } };
  const patch = menuClickPatch(s, 'https://y.com/');
  assert.deepEqual(patch.colorTemperature.excludedHosts, ['y.com']);
  assert.equal(patch.exclusionList, undefined, '不得误写暗色排除表');
});
