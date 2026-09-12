// tests/unit/scope.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostname, hostnameInList, siteDarkActive } from '../../src/shared/scope.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

test('normalizeHostname trims, lowercases, and strips www.', () => {
  assert.equal(normalizeHostname('  WWW.GitHub.COM '), 'github.com');
  assert.equal(normalizeHostname('gist.github.com'), 'gist.github.com');
  assert.equal(normalizeHostname(null), '');
});

test('hostnameInList matches exactly and on dot-boundary suffixes only', () => {
  assert.equal(hostnameInList('github.com', ['github.com']), true);
  assert.equal(hostnameInList('gist.github.com', ['github.com']), true);
  assert.equal(hostnameInList('github.com', ['gist.github.com']), false);
  assert.equal(hostnameInList('notgithub.com', ['github.com']), false);
  assert.equal(hostnameInList('github.com', []), false);
  assert.equal(hostnameInList('', ['github.com']), false);
});

test('siteDarkActive gates on state and the active list semantics', () => {
  const dark = { ...DEFAULT_SETTINGS, state: 'dark' };
  assert.equal(siteDarkActive(dark, 'example.com'), true);
  assert.equal(siteDarkActive({ ...dark, exclusionList: ['example.com'] }, 'example.com'), false);
  assert.equal(siteDarkActive({ ...dark, exclusionList: ['example.com'] }, 'sub.example.com'), false);
  assert.equal(siteDarkActive({ ...dark, inclusionMode: true }, 'example.com'), false);
  assert.equal(siteDarkActive({ ...dark, inclusionMode: true, inclusionList: ['example.com'] }, 'sub.example.com'), true);
  assert.equal(siteDarkActive({ ...DEFAULT_SETTINGS, state: 'light', inclusionList: ['example.com'] }, 'example.com'), false);
});
