// tests/unit/flash-guard.test.mjs
// M3-BEHAVIOR §2：三模式 CSS 字面、挂载判定真值表。
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUARD_MODES, guardCssFor, shouldArmGuard } from '../../src/shared/flashGuard.js';

const S = (over = {}) => ({
  flashGuard: { enabled: true, mode: 'simple-dark', delayMs: 200, threshold: 1000, ...over },
});

test('simple-dark mode: palette bg on html, literal * rules, media exempt (§2.2)', () => {
  const css = guardCssFor('simple-dark', '#2b303a');
  assert.match(css, /html \{[^}]*background-color: #2b303a !important;/);
  assert.match(css, /html \* \{[^}]*color: #eeeeee !important;/);
  assert.match(css, /html \* \{[^}]*border-color: #555555 !important;/);
  assert.match(css, /html \* \{[^}]*background-color: #292929 !important;/);
  assert.match(css, /html video, html input, html textarea \{[^}]*background-color: transparent !important;/);
});

test('hide mode: dark html + * display none, no * colors (§2.2)', () => {
  const css = guardCssFor('hide', '#2b303a');
  assert.match(css, /html \* \{ display: none !important; \}/);
  assert.doesNotMatch(css, /#eeeeee/);
  assert.match(css, /background-color: #2b303a !important;/);
});

test('brightness mode: html filter 0.25 only, no * rules (§2.2)', () => {
  const css = guardCssFor('brightness', '#2b303a');
  assert.match(css, /html \{[^}]*filter: brightness\(0\.25\) !important;/);
  assert.doesNotMatch(css, /html \*/);
  assert.doesNotMatch(css, /#2b303a/);
});

test('GUARD_MODES lists exactly the three radio values', () => {
  assert.deepEqual(GUARD_MODES, ['simple-dark', 'hide', 'brightness']);
});

test('shouldArmGuard truth table (§2.3: enabled × top-frame × recheck)', () => {
  const on = { isTopFrame: true, isRecheckRender: false };
  assert.equal(shouldArmGuard(S(), on), true);
  assert.equal(shouldArmGuard(S({ enabled: false }), on), false, '总开关关');
  assert.equal(shouldArmGuard(S(), { isTopFrame: false, isRecheckRender: false }), false, 'iframe 不挂（§10-3）');
  assert.equal(shouldArmGuard(S(), { isTopFrame: true, isRecheckRender: true }), false, 'recheck 渲染不重挂（§10-4）');
});
