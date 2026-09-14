// tests/unit/scope.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostname, hostnameInList, siteDarkActive, engineOwnsSite }
  from '../../src/shared/scope.js';
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

test('engineOwnsSite truth table — policy × site-null × compatible (M2-BEHAVIOR §1)', () => {
  const plain = { id: 'nv-example' };
  const compatible = { id: 'nv-example', compatible: true };
  // respect → a usable site theme wins; no site → the engine
  assert.equal(engineOwnsSite('respect', plain), false);
  assert.equal(engineOwnsSite('respect', compatible), false);
  assert.equal(engineOwnsSite('respect', null), true);
  // ignore → the engine always, with or without a site theme
  assert.equal(engineOwnsSite('ignore', plain), true);
  assert.equal(engineOwnsSite('ignore', compatible), true);
  assert.equal(engineOwnsSite('ignore', null), true);
  // skip-compatible → the engine except on compatible-marked sites
  assert.equal(engineOwnsSite('skip-compatible', compatible), true);
  assert.equal(engineOwnsSite('skip-compatible', plain), false);
  assert.equal(engineOwnsSite('skip-compatible', null), true);
});
