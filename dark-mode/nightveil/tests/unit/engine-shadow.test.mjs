// tests/unit/engine-shadow.test.mjs
// Shadow DOM penetration pure parts (M2b Task 7, §5): the main-world hook
// script is asserted as source text (it runs in the page's main world, outside
// the node test runtime — no execution), plus the engine's shadow key wiring.
// DOM assembly (engineProcessShadowRoots walks, sheet adoption, deactivate
// disable) is verified via heavy.html in Task 8.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHADOW_HOST_ATTR, decideObservers } from '../../src/content/engine/engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hook = readFileSync(join(ROOT, 'public', 'nv-shadow-hook.js'), 'utf8');

test('hook: proxies Element.prototype.attachShadow and calls the original', () => {
  assert.match(hook, /Element\.prototype\.attachShadow\s*=/);
  assert.match(hook, /Reflect\.apply\(/);
});

test('hook: forces init.mode = \'open\' so the engine can reach shadowRoot', () => {
  assert.match(hook, /init\.mode\s*=\s*'open'/);
});

test('hook: posts the nv-shadow-attach message literal on first marking', () => {
  assert.match(hook, /postMessage\(\s*\{\s*from:\s*'nv-shadow-attach'/);
});

test('hook: idempotent double-injection guard', () => {
  assert.match(hook, /if\s*\(\s*window\.__nvShadowHook\s*\)\s*return\s*;/);
  assert.match(hook, /window\.__nvShadowHook\s*=\s*true\s*;/);
});

test('hook: whole body wrapped in try/catch — never breaks the page', () => {
  assert.match(hook, /^\s*try\s*\{/m);
  assert.match(hook, /catch\s*\(/);
});

test('hook: nv-shdw-<random> host key format', () => {
  assert.match(hook, /nv-shdw-/);
  assert.match(hook, /Math\.floor\(\s*Math\.random\(\)\s*\*\s*1e7\s*\)/);
});

test('hook: marks hosts with data-nv-shadowhost and syncs data-nv-active', () => {
  assert.match(hook, /data-nv-shadowhost/);
  assert.match(hook, /data-nv-active/);
});

test('SHADOW_HOST_ATTR export matches the hook attribute', () => {
  assert.equal(SHADOW_HOST_ATTR, 'data-nv-shadowhost');
});

test('decideObservers gains the shadow key driven by processShadowStyles', () => {
  assert.equal(decideObservers({}).shadow, false);
  assert.equal(decideObservers({ processShadowStyles: true }).shadow, true);
  assert.equal(decideObservers({ processShadowStyles: 1 }).shadow, false); // strict ===
});
