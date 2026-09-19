// tests/unit/color-temp.test.mjs
// M3-BEHAVIOR §1：挂载判定（亮色态默认、dark 态仅包含未命中）、排除精确匹配、CSS 字面。
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORTEMP_CSS, colorTempExcluded, shouldRenderColorTemp } from '../../src/shared/colorTemp.js';

const S = (over = {}) => ({
  state: 'light',
  inclusionMode: false,
  inclusionList: [],
  colorTemperature: { enabled: true, red: 255, green: 227, blue: 199, opacity: 100, excludedHosts: [], ...over },
  ...over,
});

test('light state + enabled + not excluded → render (§1.2)', () => {
  assert.equal(shouldRenderColorTemp(S(), 'example.com'), true);
});

test('disabled → never render', () => {
  assert.equal(shouldRenderColorTemp(S({ colorTemperature: { enabled: false } }), 'example.com'), false);
});

test('excludedHosts match is exact after www-strip, no subdomain coverage (§10-2)', () => {
  const s = S({ colorTemperature: { enabled: true, excludedHosts: ['google.com'] } });
  assert.equal(colorTempExcluded(s, 'google.com'), true);
  assert.equal(colorTempExcluded(s, 'www.google.com'), true, 'www 剥离后等值');
  assert.equal(colorTempExcluded(s, 'mail.google.com'), false, '子域不覆盖');
  assert.equal(colorTempExcluded(s, 'notgoogle.com'), false, '后缀不算');
});

test('excluded host blocks render', () => {
  const s = S({ colorTemperature: { enabled: true, excludedHosts: ['example.com'] } });
  assert.equal(shouldRenderColorTemp(s, 'example.com'), false);
});

test('dark state: only inclusion-mode miss keeps the tint (§10-1)', () => {
  const dark = { ...S(), state: 'dark' };
  assert.equal(shouldRenderColorTemp(dark, 'example.com'), false, 'dark + 排除语义 → 移除');
  const incl = { ...dark, inclusionMode: true };
  assert.equal(shouldRenderColorTemp(incl, 'example.com'), true, 'dark + 包含模式未命中 → 保留');
  assert.equal(shouldRenderColorTemp({ ...incl, inclusionList: ['example.com'] }, 'example.com'), false, '命中 → 移除');
});

test('overlay CSS pins the original literals (§1.3)', () => {
  assert.match(COLORTEMP_CSS, /mix-blend-mode: multiply !important;/);
  assert.match(COLORTEMP_CSS, /z-index: 2147483647 !important;/);
  assert.match(COLORTEMP_CSS, /width: 120% !important;/);
  assert.match(COLORTEMP_CSS, /background: rgba\(var\(--nv-ct-red\), var\(--nv-ct-green\), var\(--nv-ct-blue\), var\(--nv-ct-opacity\)\) !important;/);
});
