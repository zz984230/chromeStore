// tests/unit/actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hostnameFromUrl, menuClickPatch, toolbarClickPatch } from '../../src/shared/actions.js';
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

test('toolbarClickPatch toggles global state by default', () => {
  assert.deepEqual(toolbarClickPatch({ ...DEFAULT_SETTINGS, state: 'light' }, 'https://x.com/'), { state: 'dark' });
  assert.deepEqual(toolbarClickPatch({ ...DEFAULT_SETTINGS, state: 'dark' }, null), { state: 'light' });
});

test('toolbarClickPatch per-site mode adds, then removes governing entries', () => {
  const s = { ...DEFAULT_SETTINGS, state: 'dark', inclusionMode: true, perSiteToggle: true };
  assert.deepEqual(toolbarClickPatch(s, 'https://www.github.com/'), { inclusionList: ['github.com'] });
  const listed = { ...s, inclusionList: ['github.com'] };
  assert.deepEqual(toolbarClickPatch(listed, 'https://gist.github.com/'), { inclusionList: [] });
  const siblings = { ...s, inclusionList: ['github.com', 'gist.github.com'] };
  assert.deepEqual(toolbarClickPatch(siblings, 'https://github.com/'), { inclusionList: ['gist.github.com'] });
  assert.deepEqual(toolbarClickPatch(s, null), { state: 'light' }, 'no url → global fallback');
});
