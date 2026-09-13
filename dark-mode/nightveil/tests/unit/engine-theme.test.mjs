// tests/unit/engine-theme.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_VARIABLES, EXTRA_RULES_DEFAULT, engineVarsCss } from '../../src/shared/engineTheme.js';

test('18 variables with the contract defaults', () => {
  assert.equal(Object.keys(ENGINE_VARIABLES).length, 18);
  assert.equal(ENGINE_VARIABLES['--nv-surface'], '#292929');
  assert.equal(ENGINE_VARIABLES['--nv-text'], '#dcdcdc');
  assert.equal(ENGINE_VARIABLES['--nv-link'], '#8db2e5');
  assert.equal(ENGINE_VARIABLES['--nv-link-visited'], '#c76ed7');
  assert.equal(ENGINE_VARIABLES['--nv-cite'], '#92de92');
  assert.equal(ENGINE_VARIABLES['--nv-accent'], '#a9a9a9');
  assert.equal(ENGINE_VARIABLES['--nv-edge'], '#555555');
  assert.equal(ENGINE_VARIABLES['--nv-ink'], '#7d7d7d');
  assert.equal(ENGINE_VARIABLES['--nv-mark'], '#003d9b');
  assert.equal(ENGINE_VARIABLES['--nv-figure-opacity'], '0.85');
  assert.equal(ENGINE_VARIABLES['--nv-image-brightness'], '0.85');
  assert.equal(ENGINE_VARIABLES['--nv-shadow-box'], '0 0 0 1px rgb(255 255 255 / 10%)');
  assert.equal(ENGINE_VARIABLES['--nv-shadow-text'], 'none');
  assert.equal(ENGINE_VARIABLES['--nv-transparent'], 'transparent');
  assert.equal(ENGINE_VARIABLES['--nv-image-veil'], 'rgba(0, 0, 0, 0.10)');
  assert.equal(ENGINE_VARIABLES['--nv-image-filter'], 'brightness(50%) contrast(200%)');
  assert.equal(ENGINE_VARIABLES['--nv-blend'], 'multiply');
  assert.equal(ENGINE_VARIABLES['--nv-scrollbar'], 'auto');
});

test('vars css targets root and pseudos with every variable', () => {
  const css = engineVarsCss(ENGINE_VARIABLES);
  assert.ok(css.startsWith(':root, ::after, ::before, ::backdrop {'));
  for (const name of Object.keys(ENGINE_VARIABLES)) assert.ok(css.includes(`${name}: `));
});

test('extra rules default covers the documented surface', () => {
  assert.ok(EXTRA_RULES_DEFAULT.includes('color-scheme: dark'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-link)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-link-visited)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-cite)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-mark)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-figure-opacity)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-image-brightness)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-accent)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-scrollbar)'));
});
