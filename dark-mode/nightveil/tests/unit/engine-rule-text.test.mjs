import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuleText } from '../../src/content/engine/engine.js';

test('buildRuleText assembles selector/prop/value with optional priority', () => {
  assert.equal(buildRuleText('html[data-nv-active] .a', 'color', 'red', { priority: true }),
    'html[data-nv-active] .a { color: red !important }');
  assert.equal(buildRuleText('html[data-nv-active] .a', 'color', 'red', { priority: false }),
    'html[data-nv-active] .a { color: red }');
});
