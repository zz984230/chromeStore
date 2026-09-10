// tests/unit/icons-map.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { iconPathsFor } from '../../src/shared/icons.js';

test('iconPathsFor maps states to full size sets', () => {
  assert.deepEqual(iconPathsFor('dark'), {
    16: 'icons/dark/16.png', 32: 'icons/dark/32.png', 48: 'icons/dark/48.png', 64: 'icons/dark/64.png',
  });
  assert.deepEqual(iconPathsFor('light'), {
    16: 'icons/light/16.png', 32: 'icons/light/32.png', 48: 'icons/light/48.png', 64: 'icons/light/64.png',
  });
});
