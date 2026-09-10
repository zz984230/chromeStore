// tests/unit/strings-source.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../../src/shared/strings.js';

const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));

test('static files and STRINGS agree on shared copy (single source of truth)', () => {
  assert.equal(manifest.name, STRINGS.extensionName);
  assert.equal(manifest.description, STRINGS.extensionDescription);
});
