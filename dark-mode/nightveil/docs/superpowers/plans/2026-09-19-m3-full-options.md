# M3 · 完整选项（Full Options）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 M3 六块功能（色温 / 防白闪完整版 / 定时 / User CSS / 杂项 / 选项字号）+ 两条 M2 引擎债，行为面以 docs/M3-BEHAVIOR.md（已关门，§11 拍板记录）为准。

**Architecture:** 沿用 nightveil 既有分层——纯决策逻辑进 `src/shared/*.js`（node --test 直测，jsdom-free），DOM 接线进 `src/content/main.js` / `src/options/main.js` / `src/background/main.js`（单测不加载，走 /tabbit 真机验收）；选项控件数据驱动（表在 shared，渲染在 options）；文案单源 `src/shared/strings.js`。

**Tech Stack:** Chrome MV3（service worker + content scripts）、esbuild 三入口、node --test（node:test + 内联 stub，无 jsdom）。

## Global Constraints

- 行为唯一裁决来源：`docs/M3-BEHAVIOR.md`（§8 键名映射、§10 怪癖 14 条照抄、§11 拍板记录）。
- 设置存储：单对象 `nightveil.settings`（`src/shared/settings.js`），嵌套组二级深合并；**不得**新增平铺存储键。
- 文案：一切 UI 文案只能来自 `src/shared/strings.js`（strings-source 测试锁定）；新增 key 用英文，语义贴近原版对应控件。
- 测试：`npm test`（node --test）全绿后才可提交；新模块必须有对应 `tests/unit/*.test.mjs`；不改既有测试的期望值（只可追加）。
- 构建：`npm run build` 三入口零错误；新 src 文件经 import 打包，**不改** entryPoints。
- 提交纪律：每任务至少一次提交，消息前缀 `feat(m3):` / `fix(m3):` / `test(m3):`，结尾带 Co-Authored-By 行。
- 禁止顺手改良：与 M3-BEHAVIOR 无关的代码一律不动（BACKLOG 规则）。

---

### Task 1: 设置模式扩展（M3 键位落地）

**Files:**
- Modify: `src/shared/settings.js:13-54`
- Test: `tests/unit/settings.test.mjs`（追加）

**Interfaces:**
- Consumes: 既有 `DEFAULT_SETTINGS` / `NESTED_GROUPS` / `NESTED_SUBGROUPS`。
- Produces（后续所有任务依赖的精确键形）:
  ```js
  settings.userCss = '';                // custom 席位的 CSS 文本
  settings.documentRoot = false;        // 注入父节点 documentElement 化
  settings.reattachStyles = true;       // 引擎元素防删重挂（M3-BEHAVIOR §5.3）
  settings.colorTemperature = { enabled: false, red: 255, green: 227, blue: 199, opacity: 100, excludedHosts: [] };
  settings.flashGuard = { enabled: true, mode: 'simple-dark', delayMs: 200, threshold: 1000 };  // mode: 'simple-dark' | 'hide' | 'brightness'
  settings.schedule = { enabled: false, onTime: '', offTime: '' };  // 时间为 'HH:MM' 或 ''
  settings.ui = { fontSize: 13, sectionOpen: { themes: false, options: false, usercss: false, engine: true, exclusion: false, inclusion: false, schedule: false } };
  ```
  `themeId` 新增合法值 `'custom'`（默认仍 `'adaptive'`，`DEFAULT_SETTINGS.themeId` 不改）。

- [ ] **Step 1: 写失败测试**（追加到 `tests/unit/settings.test.mjs` 末尾）

```js
// ---- M3 keys (plan 2026-09-19-m3-full-options Task 1) ----
test('M3 defaults carry the four new nested groups and three top-level keys', async () => {
  const mem = new MemoryStorage();
  const s = await loadSettings(mem);
  assert.equal(s.userCss, '');
  assert.equal(s.documentRoot, false);
  assert.equal(s.reattachStyles, true);
  assert.deepEqual(s.colorTemperature, { enabled: false, red: 255, green: 227, blue: 199, opacity: 100, excludedHosts: [] });
  assert.deepEqual(s.flashGuard, { enabled: true, mode: 'simple-dark', delayMs: 200, threshold: 1000 });
  assert.deepEqual(s.schedule, { enabled: false, onTime: '', offTime: '' });
  assert.deepEqual(s.ui, { fontSize: 13, sectionOpen: { themes: false, options: false, usercss: false, engine: true, exclusion: false, inclusion: false, schedule: false } });
});

test('M3 nested groups deep-merge: partial colorTemperature backfills siblings', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { colorTemperature: { enabled: true }, schedule: { onTime: '07:30' } } });
  const s = await loadSettings(mem);
  assert.equal(s.colorTemperature.enabled, true);
  assert.equal(s.colorTemperature.red, 255);
  assert.deepEqual(s.colorTemperature.excludedHosts, []);
  assert.equal(s.schedule.onTime, '07:30');
  assert.equal(s.schedule.offTime, '');
  assert.equal(s.ui.sectionOpen.engine, true);
});

test('legacy M2 settings upgrade fills all M3 groups', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { state: 'dark', themeId: 'adaptive' } });
  const s = await loadSettings(mem);
  assert.equal(s.flashGuard.mode, 'simple-dark');
  assert.equal(s.ui.fontSize, 13);
  assert.deepEqual(s.schedule, { enabled: false, onTime: '', offTime: '' });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/zero/Project/chromeStore/dark-mode/nightveil && node --test tests/unit/settings.test.mjs`
Expected: 3 FAIL（`s.colorTemperature` undefined 等）。

- [ ] **Step 3: 最小实现**——`src/shared/settings.js`

`DEFAULT_SETTINGS` 在 `engine: engineDefaults(),` 行后追加三个平铺键与四个嵌套组：

```js
  engine: engineDefaults(),
  // ---- M3（plan 2026-09-19-m3-full-options；M3-BEHAVIOR §8）----
  userCss: '',                // themeId 'custom' 席位的样式文本
  documentRoot: false,        // true → 样式元素挂 documentElement 而非 head
  reattachStyles: true,       // 引擎重扫时重挂被删的引擎元素（§5.3）
  colorTemperature: { enabled: false, red: 255, green: 227, blue: 199, opacity: 100, excludedHosts: [] },
  flashGuard: { enabled: true, mode: 'simple-dark', delayMs: 200, threshold: 1000 },
  schedule: { enabled: false, onTime: '', offTime: '' },
  ui: {
    fontSize: 13,
    sectionOpen: { themes: false, options: false, usercss: false, engine: true, exclusion: false, inclusion: false, schedule: false },
  },
```

`NESTED_GROUPS` 改为：

```js
const NESTED_GROUPS = ['exclusionRules', 'engine', 'colorTemperature', 'flashGuard', 'schedule', 'ui'];
```

`NESTED_SUBGROUPS` 追加一行：

```js
  ui: ['sectionOpen'],
```

- [ ] **Step 4: 全量测试通过**

Run: `npm test`
Expected: 全绿（既有 162 + 新 3 = 165 passing）。

- [ ] **Step 5: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/shared/settings.js dark-mode/nightveil/tests/unit/settings.test.mjs
git commit -m "feat(m3): settings schema — colorTemperature/flashGuard/schedule/ui groups + custom-seat keys"
```

---

### Task 2: 防白闪完整版（guard 三模式 + 参数化 + 顶层帧 + recheck 抑制）

**Files:**
- Create: `src/shared/flashGuard.js`
- Modify: `src/content/main.js:15-65, 160-218, 232-281`
- Test: Create `tests/unit/flash-guard.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `settings.flashGuard`（enabled/mode/delayMs/threshold）。
- Produces:
  ```js
  // src/shared/flashGuard.js
  export const GUARD_MODES = ['simple-dark', 'hide', 'brightness'];
  export function guardCssFor(mode, bg);          // → CSS 文本（完整 <style> 内容）
  export function shouldArmGuard(settings, { isTopFrame, isRecheckRender }); // → boolean
  ```

- [ ] **Step 1: 写失败测试** `tests/unit/flash-guard.test.mjs`

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/flash-guard.test.mjs`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/shared/flashGuard.js`**

```js
// src/shared/flashGuard.js
// 防白闪完整版的纯决策面（M3-BEHAVIOR §2；CSS 字面来自原版 inject.css:1-55）。
// nightveil 用内容脚本注入 <style> 文本实现（等价于原版 document_start 常驻
// CSS + html 属性切换：注入即生效、移除即消失，无需属性间接层）。
export const GUARD_MODES = ['simple-dark', 'hide', 'brightness'];

// mode CSS。bg 仅用于 html 背景（R2 拍板：simple/hide 的 html 背景沿用 nightveil
// M1 已接受的调色板感知版本；`*` 级规则与 brightness 模式字面照抄原版）。
export function guardCssFor(mode, bg) {
  if (mode === 'brightness') {
    return 'html { height: 100vh !important; color-scheme: dark !important; filter: brightness(0.25) !important; }';
  }
  const base = `html { filter: none !important; height: 100vh !important; transition: none !important; color-scheme: dark !important; background-color: ${bg} !important; }`;
  if (mode === 'hide') return `${base}\nhtml * { display: none !important; }`;
  return `${base}\nhtml * { color: #eeeeee !important; border-color: #555555 !important; background-color: #292929 !important; }\n`
    + 'html video, html input, html textarea { border-color: transparent !important; background-color: transparent !important; }';
}

// 挂载判定（§2.3）：总开关 × 仅顶层帧 × recheck 渲染不重挂。
export function shouldArmGuard(settings, { isTopFrame, isRecheckRender }) {
  if (!settings.flashGuard?.enabled) return false;
  if (!isTopFrame) return false;
  if (isRecheckRender) return false;
  return true;
}
```

- [ ] **Step 4: 跑测试通过**

Run: `node --test tests/unit/flash-guard.test.mjs`
Expected: 5 PASS。

- [ ] **Step 5: 接线 `src/content/main.js`**

1) import 行（第 7 行 `compileThemeById` 之后追加）：

```js
import { guardCssFor, shouldArmGuard } from '../shared/flashGuard.js';
```

2) 删除常量 `GUARD_REMOVE_DELAY_MS`（第 17 行），guard 机制改为：

```js
let guardTimer = null;
// Guard dismissal（§2.3-2/3）：清 pending 定时器后按设置的 delayMs 摘除。
function dismissGuardSoon(delayMs) {
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = setTimeout(() => removeStyle(GUARD_STYLE_ID), delayMs);
}

function armGuard(settings, bgOverride, { recheck = false } = {}) {
  if (recheck) return; // §10-4：recheck 渲染既不重挂也不强摘——既有定时器自理
  if (!shouldArmGuard(settings, { isTopFrame: window === window.top, isRecheckRender: false })) {
    removeStyle(GUARD_STYLE_ID);
    return;
  }
  const fg = settings.flashGuard ?? {};
  const delay = Number.isFinite(Number(fg.delayMs)) ? Number(fg.delayMs) : 200;
  const bg = bgOverride ?? guardBackgroundFor(findPalette(settings.themeId));
  injectStyle(GUARD_STYLE_ID, guardCssFor(fg.mode ?? 'simple-dark', bg));
  if (guardTimer) clearTimeout(guardTimer);
  if (document.readyState === 'complete') {
    dismissGuardSoon(delay);
  } else {
    window.addEventListener('load', () => dismissGuardSoon(delay), { once: true });
  }
}
```

3) `applyTheme` / `applyEngine` / `applyClassic` 增透传 `opts`（recheck 标志从 render 一路传到 armGuard）：

```js
function applyTheme(settings, opts) {
  const site = matchSiteTheme(location.hostname);
  const siteUsable = site && !(settings.disabledSiteThemes ?? []).includes(site.id);
  if (settings.themeId === 'adaptive') { applyEngine(settings, site, siteUsable, opts); return; }
  applyClassic(settings, site, siteUsable, opts);
}
```

`applyEngine(settings, site, siteUsable, opts)` 内两处改动：

```js
  armGuard(settings, ENGINE_VARIABLES['--nv-surface'], opts);
```

```js
  const threshold = Number(settings.flashGuard?.threshold) || 1000;
  const lightPage = document.querySelectorAll('*').length < threshold;
  activateEngine(settings, lightPage
    ? { onFirstRule: () => dismissGuardSoon(Number(settings.flashGuard?.delayMs) || 200) }
    : undefined);
```

`applyClassic(settings, site, siteUsable, opts)` 内：`armGuard(settings, undefined, opts);`（load 兜底路径已由 armGuard 内 listener 承担，`applyEngine`/`applyClassic` 尾部各有一个 window load 复标记 listener，不动）。

4) `render` 签名与 recheck 调用：

```js
function render(settings, opts = {}) {
```

体内三处 `applyTheme(settings)` → `applyTheme(settings, opts)`；post-load recheck 重渲染处（§6）：

```js
      setTimeout(() => { if (gen === renderGeneration) render(lastSettings, { recheck: true }); },
        Number(settings.engine.recheckDelay) || 0);
```

- [ ] **Step 6: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿、构建零错误。

- [ ] **Step 7: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/shared/flashGuard.js dark-mode/nightveil/src/content/main.js dark-mode/nightveil/tests/unit/flash-guard.test.mjs
git commit -m "feat(m3): flash guard full version — three modes, tunable delay/threshold, top-frame only, recheck suppress"
```

---

### Task 3: 色温层（content 侧渲染 + 状态交互）

**Files:**
- Create: `src/shared/colorTemp.js`
- Modify: `src/content/main.js`（import + 新函数 + render 两分支收尾）
- Test: Create `tests/unit/color-temp.test.mjs`

**Interfaces:**
- Consumes: Task 1 `settings.colorTemperature`；`shared/scope.js` 的 `normalizeHostname`。
- Produces:
  ```js
  // src/shared/colorTemp.js
  export const COLORTEMP_STYLE_ID = 'nv-colortemp';
  export const COLORTEMP_ATTR = 'data-nv-colortemp';
  export const COLORTEMP_OVERLAY_CLASS = 'nv-colortemp-overlay';
  export const COLORTEMP_CSS;                                    // 完整 <style> 文本
  export function colorTempExcluded(settings, hostname);         // → boolean（精确匹配，§10-2）
  export function shouldRenderColorTemp(settings, hostname);     // → boolean（§1.2/§10-1）
  ```
  content/main.js 新增内部函数 `applyColorTemp(settings)`（非导出）。

- [ ] **Step 1: 写失败测试** `tests/unit/color-temp.test.mjs`

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/color-temp.test.mjs`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/shared/colorTemp.js`**

```js
// src/shared/colorTemp.js
// 色温层纯决策面（M3-BEHAVIOR §1）。CSS 字面来自原版 inject.css:59-79；
// 变量名按 nightveil 前缀约定改为 --nv-ct-*（内部实现细节，行为不变）。
import { normalizeHostname } from './scope.js';

export const COLORTEMP_STYLE_ID = 'nv-colortemp';
export const COLORTEMP_ATTR = 'data-nv-colortemp';
export const COLORTEMP_OVERLAY_CLASS = 'nv-colortemp-overlay';

export const COLORTEMP_CSS = `html[data-nv-colortemp] .nv-colortemp-overlay {
  border: 0 !important; top: -10% !important; margin: 0 !important; opacity: 1 !important;
  padding: 0 !important; right: -10% !important; width: 120% !important; height: 120% !important;
  outline: none !important; display: block !important; position: fixed !important; border-radius: 0 !important;
  box-shadow: none !important; text-shadow: none !important; z-index: 2147483647 !important;
  pointer-events: none !important; transition: opacity 0.1s !important; mix-blend-mode: multiply !important;
  background: rgba(var(--nv-ct-red), var(--nv-ct-green), var(--nv-ct-blue), var(--nv-ct-opacity)) !important;
}`;

// 排除表精确等值匹配（去 www.、大小写归一；无子域通配）——§10-2。
export function colorTempExcluded(settings, hostname) {
  const host = normalizeHostname(hostname);
  return (settings.colorTemperature?.excludedHosts ?? [])
    .some((h) => normalizeHostname(h) === host);
}

// 挂载判定（§1.2 / §10-1）：亮色态默认渲染；dark 态仅「包含模式未命中」
// 分支保留（原版 inject.js:824/847-849 分支结构——排除命中/规则排除不重建）。
export function shouldRenderColorTemp(settings, hostname) {
  const ct = settings.colorTemperature;
  if (!ct?.enabled) return false;
  if (colorTempExcluded(settings, hostname)) return false;
  if (settings.state === 'light') return true;
  if (settings.state !== 'dark') return false;
  if (!settings.inclusionMode) return false;
  const host = normalizeHostname(hostname);
  return !(settings.inclusionList ?? []).some((h) => normalizeHostname(h) === host);
}
```

- [ ] **Step 4: 跑测试通过**

Run: `node --test tests/unit/color-temp.test.mjs`
Expected: 6 PASS。

- [ ] **Step 5: 接线 `src/content/main.js`**

import 追加：

```js
import { COLORTEMP_STYLE_ID, COLORTEMP_ATTR, COLORTEMP_OVERLAY_CLASS, COLORTEMP_CSS, shouldRenderColorTemp } from '../shared/colorTemp.js';
```

`teardown()` 之后新增函数（幂等重建，§1.2——先全清再判定）：

```js
// 色温层（M3-BEHAVIOR §1）：仅顶层帧；幂等重建（清 overlay/属性/变量 → 判定 → 重挂）。
function applyColorTemp(settings) {
  if (window !== window.top) return;
  const de = document.documentElement;
  document.querySelector(`.${COLORTEMP_OVERLAY_CLASS}`)?.remove();
  removeStyle(COLORTEMP_STYLE_ID);
  if (de) {
    de.removeAttribute(COLORTEMP_ATTR);
    for (const v of ['--nv-ct-red', '--nv-ct-green', '--nv-ct-blue', '--nv-ct-opacity']) {
      de.style.removeProperty(v);
    }
  }
  if (!shouldRenderColorTemp(settings, location.hostname)) return;
  const ct = settings.colorTemperature;
  injectStyle(COLORTEMP_STYLE_ID, COLORTEMP_CSS);
  de.setAttribute(COLORTEMP_ATTR, '');
  de.style.setProperty('--nv-ct-red', String(ct.red));
  de.style.setProperty('--nv-ct-green', String(ct.green));
  de.style.setProperty('--nv-ct-blue', String(ct.blue));
  de.style.setProperty('--nv-ct-opacity', String(ct.opacity / 100));
  const overlay = document.createElement('div');
  overlay.setAttribute('class', COLORTEMP_OVERLAY_CLASS);
  de.insertBefore(overlay, de.firstChild);
}
```

`render()` 内两处收尾调用（先 teardown 分支）：

```js
  if (!siteDarkActive(settings, location.hostname)
      || evaluateRules(rules, collectRuleSignals(false))) {
    teardown();
    applyColorTemp(settings);
    return;
  }
```

函数末尾（post-load recheck 块之后）追加：

```js
  applyColorTemp(settings);
```

darkBackground 分支的 `whenDomReady` 回调在 `applyTheme(settings, opts)` 或提前 return 后同样补 `applyColorTemp(settings)`（保持两分支一致：页面排除成立时也走 applyColorTemp）：

```js
    whenDomReady(() => {
      if (gen !== renderGeneration) return;
      teardown();
      if (evaluateRules(rules, collectRuleSignals(true))) { applyColorTemp(settings); return; }
      applyTheme(settings, opts);
      applyColorTemp(settings);
    });
```

- [ ] **Step 6: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/shared/colorTemp.js dark-mode/nightveil/src/content/main.js dark-mode/nightveil/tests/unit/color-temp.test.mjs
git commit -m "feat(m3): color temperature layer — top-frame overlay, exact-match exclusions, dark-state inclusion-branch rule"
```

---

### Task 4: User CSS 席位（custom 主题）

**Files:**
- Modify: `src/shared/themes.js`（新增 `baseCssForTheme`）
- Modify: `src/content/main.js:196-218`（applyClassic 换 base 决策）
- Test: `tests/unit/themes.test.mjs`（追加）

**Interfaces:**
- Consumes: Task 1 `settings.themeId === 'custom'` / `settings.userCss`；既有 `compileThemeById`。
- Produces:
  ```js
  // src/shared/themes.js
  export const USER_CSS_THEME_ID = 'custom';
  export function baseCssForTheme(themeId, userCss, siteUsable); // → CSS 文本
  ```

- [ ] **Step 1: 写失败测试**（追加到 `tests/unit/themes.test.mjs` 末尾）

```js
// ---- M3 custom seat (plan Task 4; M3-BEHAVIOR §4.1/§10-10) ----
import { USER_CSS_THEME_ID, baseCssForTheme } from '../../src/shared/themes.js';

test('custom seat on a non-site page injects ONLY the user CSS text (§4.1)', () => {
  const css = baseCssForTheme('custom', 'html { background: #101010 !important; }', false);
  assert.equal(css, 'html { background: #101010 !important; }');
});

test('custom seat yields to a matched site theme (§10-10): base becomes nv-simple', () => {
  const css = baseCssForTheme('custom', 'html { background: #101010 !important; }', true);
  assert.equal(css, compileThemeById('nv-simple'));
});

test('custom seat with empty userCss injects empty text (original injects empty too)', () => {
  assert.equal(baseCssForTheme('custom', '', false), '');
});

test('classic themes keep their compiled base, siteUsable does not change it', () => {
  assert.equal(baseCssForTheme('nv-coffee', 'ignored', true), compileThemeById('nv-coffee'));
  assert.equal(baseCssForTheme('nv-coffee', 'ignored', false), compileThemeById('nv-coffee'));
});

test('USER_CSS_THEME_ID is the literal seat id', () => {
  assert.equal(USER_CSS_THEME_ID, 'custom');
});
```

（文件顶部如未导入 `compileThemeById`，在既有 import 行补上。）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/themes.test.mjs`
Expected: 新 5 例 FAIL（`baseCssForTheme` 未导出）。

- [ ] **Step 3: 实现**——`src/shared/themes.js` 在 `compileThemeById` 之后追加：

```js
// M3 custom 席位（M3-BEHAVIOR §4.1）：themeId 'custom' 时只注入用户 CSS 文本，
// 无任何基础层；命中站点主题时 custom 让位（base 退回 nv-simple，站点层照常叠加）。
export const USER_CSS_THEME_ID = 'custom';

export function baseCssForTheme(themeId, userCss, siteUsable) {
  if (themeId === USER_CSS_THEME_ID) {
    return siteUsable ? compileThemeById('nv-simple') : (userCss ?? '');
  }
  return compileThemeById(themeId);
}
```

- [ ] **Step 4: 接线 `src/content/main.js` applyClassic**

import 行补 `baseCssForTheme`（并入既有 `compileThemeById, guardBackgroundFor` 的 import）。`applyClassic` 内：

```js
  injectStyle(CLASSIC_STYLE_ID, baseCssForTheme(settings.themeId, settings.userCss, Boolean(siteUsable)));
```

（替换原 `injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));`。`compileThemeById` 若因此不再被 main.js 使用则从 import 中移除。）

- [ ] **Step 5: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/shared/themes.js dark-mode/nightveil/src/content/main.js dark-mode/nightveil/tests/unit/themes.test.mjs
git commit -m "feat(m3): user CSS theme seat — userCss-only base, site-theme precedence"
```

---

### Task 5: 杂项（documentRoot 注入父节点 + reattachStyles 防删重挂）

**Files:**
- Modify: `src/content/main.js:32-40`（injectStyle 父节点）
- Modify: `src/content/engine/engine.js:575-601, 825-834, 473-482`（mountStyle 父节点 + 重扫自检）
- Test: `tests/unit/engine-lifecycle.test.mjs`（追加）

**Interfaces:**
- Consumes: Task 1 `settings.documentRoot` / `settings.reattachStyles`。
- Produces: engine 模块内部行为变化——`activateEngine` 记录父节点选择与重挂开关；`engineRescanAll` 前置 `reattachEngineStyles()`（非导出）；`mountStyle` 按记录选择父节点。无新导出。

- [ ] **Step 1: 写失败测试**（追加到 `tests/unit/engine-lifecycle.test.mjs`，沿用该文件既有的 document/MutationObserver stub 形状——见文件头说明）

```js
// ---- M3 documentRoot + reattachStyles (plan Task 5; M3-BEHAVIOR §5) ----
test('documentRoot true mounts engine styles on documentElement, not head (§5.2)', async () => {
  const { activateEngine, deactivateEngine, VARS_STYLE_ID } = await import('../../src/content/engine/engine.js');
  const { engineDefaults } = await import('../../src/content/engine/contract.js');
  const appended = [];
  const head = { appendChild: (n) => appended.push(['head', n.id]) };
  const root = { appendChild: (n) => appended.push(['root', n.id]), style: { setProperty() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {} };
  globalThis.document = makeDocumentStub({ head, root });
  const settings = { documentRoot: true, reattachStyles: true, engine: engineDefaults() };
  activateEngine(settings, {});
  assert.ok(appended.some(([where, id]) => where === 'root' && id === VARS_STYLE_ID),
    'vars 元素应挂 documentElement');
  deactivateEngine();
});

test('engineRescanAll re-attaches a detached sheet element when reattachStyles on (§5.3)', async () => {
  const { activateEngine, deactivateEngine, engineRescanAll, SHEET_STYLE_ID } = await import('../../src/content/engine/engine.js');
  const { engineDefaults } = await import('../../src/content/engine/contract.js');
  const appended = [];
  const head = { appendChild: (n) => appended.push(n.id) };
  const root = { appendChild: (n) => appended.push(n.id), style: { setProperty() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {} };
  globalThis.document = makeDocumentStub({ head, root });
  activateEngine({ documentRoot: false, reattachStyles: true, engine: engineDefaults() }, {});
  appended.length = 0;
  // 模拟站点脚本删掉引擎表元素：元素对象仍在（sheet 句柄不丢），但脱离 DOM。
  const el = globalThis.document.getElementById(SHEET_STYLE_ID);
  el.isConnected = false;
  engineRescanAll();
  assert.ok(appended.includes(SHEET_STYLE_ID), '重扫应把脱离的引擎表元素重挂（documentElement）');
  deactivateEngine();
});

test('reattachStyles off leaves detached elements alone until the next render (§5.3)', async () => {
  const { activateEngine, deactivateEngine, engineRescanAll, SHEET_STYLE_ID } = await import('../../src/content/engine/engine.js');
  const { engineDefaults } = await import('../../src/content/engine/contract.js');
  const appended = [];
  const head = { appendChild: (n) => appended.push(n.id) };
  const root = { appendChild: (n) => appended.push(n.id), style: { setProperty() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {} };
  globalThis.document = makeDocumentStub({ head, root });
  activateEngine({ documentRoot: false, reattachStyles: false, engine: engineDefaults() }, {});
  appended.length = 0;
  const el = globalThis.document.getElementById(SHEET_STYLE_ID);
  el.isConnected = false;
  engineRescanAll();
  assert.equal(appended.length, 0, '关闭时重扫不得重挂');
  deactivateEngine();
});
```

（若该文件尚无 `makeDocumentStub` 辅助，按文件头既有 stub 模式补一个最小工厂：提供 `getElementById`（含 createElement 产物的注册表）、`createElement`、`head`、`documentElement`、`styleSheets: []`、`querySelectorAll: () => []`；实现者对照文件内既有 stub 字段集裁剪。）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/engine-lifecycle.test.mjs`
Expected: 新 3 例 FAIL。

- [ ] **Step 3: 实现 engine.js**

`activateEngine(settings, ...)` 在既有 state 初始化处（`state.writtenKeyframes = new Set();` 附近）追加两行：

```js
  state.docRoot = settings.documentRoot === true;            // §5.2 注入父节点选择
  state.reattach = settings.reattachStyles !== false;        // §5.3 防删重挂开关
```

`mountStyle`（engine.js:825）改为：

```js
function mountStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    // documentRoot 开 → 挂 documentElement（M3-BEHAVIOR §5.2）；否则 head 优先。
    const parent = state.docRoot
      ? (document.documentElement ?? document.head)
      : (document.head ?? document.documentElement);
    parent.appendChild(el);
  }
  el.textContent = css;
  return el;
}
```

`engineRescanAll`（engine.js:475）顶部插入自检调用，并新增函数：

```js
// §5.3 checkstylesheet 对等项：每次引擎重扫前，若引擎元素被站点脚本摘除且
// reattach 开着，重挂到 documentElement（规则在元素的 CSSStyleSheet 句柄里
// 存活，无需文本恢复——与原版结果等价、机制更简）。
function reattachEngineStyles() {
  if (!state.reattach) return;
  const parent = document.documentElement ?? document.head;   // §10-8：重挂目标恒为 documentElement
  for (const el of [state.varsEl, state.sheetEl]) {
    if (el && el.isConnected === false) parent.appendChild(el);
  }
}

export function engineRescanAll() {
  reattachEngineStyles();
  engineRefreshContext();
  ...（原体不动）
}
```

- [ ] **Step 4: 接线 content/main.js injectStyle**

```js
function injectStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    const parent = lastSettings?.documentRoot
      ? (document.documentElement ?? document.head)
      : (document.head ?? document.documentElement);
    parent.appendChild(el);
  }
  el.textContent = css;
}
```

- [ ] **Step 5: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿（engine-lifecycle 既有断言不破坏——`state.docRoot` 默认 false 走 head 原路径）。

- [ ] **Step 6: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/content/engine/engine.js dark-mode/nightveil/src/content/main.js dark-mode/nightveil/tests/unit/engine-lifecycle.test.mjs
git commit -m "feat(m3): documentRoot injection parent + engine style re-attach on rescan (checkstylesheet parity)"
```

---

### Task 6: 引擎债（keyframes 条件包裹 + 去重键扩容 + varMap 注释）

**Files:**
- Modify: `src/content/engine/engine.js:26-45, 340-365`（copyKeyframesBlock / rewriteKeyframes / varMap 注释）
- Test: `tests/unit/engine-conditional.test.mjs`（追加）

**Interfaces:**
- Consumes: 既有 `wrapConditional`、`rewriteKeyframes(rule)` 的调用点（`visitRule` 内，conditions 参数已在线程上）。
- Produces:
  ```js
  copyKeyframesBlock(rule, conditions = []);            // 条件链包裹（外层在前）
  conditionsKeyFragment(conditions);                    // kfKey 用的规范化片段（非导出亦可，导出便于钉子）
  ```

- [ ] **Step 1: 写失败测试**（追加到 `tests/unit/engine-conditional.test.mjs`）

```js
// ---- M3 keyframes conditions threading (plan Task 6; M3-BEHAVIOR §7.1) ----
import { copyKeyframesBlock, conditionsKeyFragment } from '../../src/content/engine/engine.js';

test('copyKeyframesBlock wraps the copy in the accumulated condition chain (outer first)', () => {
  const rule = { name: 'fade', cssRules: [{ cssText: 'from { color: #fff }' }] };
  const conds = [{ at: 'media', text: '(min-width: 0px)' }, { at: 'supports', text: '(display: grid)' }];
  assert.equal(
    copyKeyframesBlock(rule, conds),
    '@media (min-width: 0px) { @supports (display: grid) { @keyframes fade { from { color: #fff } } } }');
});

test('conditionsKeyFragment distinguishes identical names under different conditions (dedup-key widening)', () => {
  const a = conditionsKeyFragment([{ at: 'media', text: '(min-width: 0px)' }]);
  const b = conditionsKeyFragment([{ at: 'media', text: '(max-width: 600px)' }]);
  const none = conditionsKeyFragment([]);
  assert.notEqual(a, b);
  assert.notEqual(a, none);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/engine-conditional.test.mjs`
Expected: 新 2 例 FAIL（copyKeyframesBlock 忽略第二参 / conditionsKeyFragment 未导出）。

- [ ] **Step 3: 实现 engine.js**

`copyKeyframesBlock`（engine.js:34）改为：

```js
// §4 d.2 + M3 §7.1：复制块进引擎表；外层 @media/@supports 条件链按原序包裹
// （原版原位改写天然保留条件——复制路线必须显式补包裹）。
export function copyKeyframesBlock(keyframesRule, conditions = []) {
  const parts = [];
  for (const kf of keyframesRule.cssRules) parts.push(kf.cssText);
  const body = `@keyframes ${keyframesRule.name} { ${parts.join(' ')} }`;
  return conditions.length
    ? conditions.reduceRight((acc, c) => wrapConditional(c.at, c.text, acc), body)
    : body;
}

// kfKey 的条件片段：同名不同条件的块各自成键（原版无去重，nightveil 的按名
// 去重是自优化——键不随条件扩容会漏扫第二条条件块）。
export function conditionsKeyFragment(conditions) {
  return conditions.map((c) => `@${c.at} ${c.text}`).join(' && ');
}
```

`rewriteKeyframes`（engine.js:351）签名与键、调用改为：

```js
function rewriteKeyframes(rule, conditions = []) {
  const target = state.shadowTarget ?? state.sheetEl;
  const sheet = target?.sheet ?? target; // constructed shadow sheets insert directly
  if (!sheet) return;
  const kfKey = `${targetKey(target)}|${rule.name}|${conditionsKeyFragment(conditions)}`;
  if (state.writtenKeyframes.has(kfKey)) return;
  let index;
  try { index = sheet.insertRule(copyKeyframesBlock(rule, conditions), 0); } catch { return; }
  ...（其余不动）
}
```

`visitRule` 内对 keyframes 的既有调用点把 `conditions` 透传（找到 `rewriteKeyframes(` 调用处改为 `rewriteKeyframes(rule, conditions)`）。varMap 收集函数（engine.js:335-348，`--` 前缀收集处）顶部补注释：

```js
// 注：keyframe 规则（副本）同样喂进 varMap —— 与原版原位遍历的收集面一致
// （M3-BEHAVIOR §7.2，行为等价，仅补说明）。
```

- [ ] **Step 4: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿（既有 keyframes 用例为无参调用，默认 `[]` 行为不变）。

- [ ] **Step 5: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/content/engine/engine.js dark-mode/nightveil/tests/unit/engine-conditional.test.mjs
git commit -m "fix(m3): keyframes copies carry their condition chain; dedup key widens to name+conditions"
```

---

### Task 7: 定时（SW alarms）

**Files:**
- Create: `src/shared/schedule.js`
- Modify: `src/background/main.js`（尾部追加接线）
- Test: Create `tests/unit/schedule.test.mjs`

**Interfaces:**
- Consumes: Task 1 `settings.schedule`；`saveSettings` / `subscribeSettings` / `loadSettings`。
- Produces:
  ```js
  // src/shared/schedule.js
  export const ALARM_ON = 'nv-schedule-on';
  export const ALARM_OFF = 'nv-schedule-off';
  export function nextAlarmTime(hhmm, now = Date.now());   // 'HH:MM' → epoch ms（已过则次日）；非法/空 → null
  export function alarmStatePatch(name);                   // ALARM_ON → {state:'dark'}；ALARM_OFF → {state:'light'}；其余 null
  export function syncAlarms(settings, alarms);            // alarms 为 chrome.alarms 形状（可选注入）；enable→per-name clear+create，disable→clearAll
  ```

- [ ] **Step 1: 写失败测试** `tests/unit/schedule.test.mjs`

```js
// tests/unit/schedule.test.mjs
// M3-BEHAVIOR §3：一次性 alarm 时刻计算、状态补丁、同步编排（chrome.alarms 内存双打）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALARM_ON, ALARM_OFF, nextAlarmTime, alarmStatePatch, syncAlarms } from '../../src/shared/schedule.js';

const NOW = new Date(2026, 8, 19, 10, 0, 0).getTime(); // 2026-09-19 10:00 local

test('nextAlarmTime: later today → today; already past → tomorrow (§3.2)', () => {
  assert.equal(nextAlarmTime('11:30', NOW), new Date(2026, 8, 19, 11, 30, 0, 0).getTime());
  assert.equal(nextAlarmTime('07:00', NOW), new Date(2026, 8, 20, 7, 0, 0, 0).getTime());
});

test('nextAlarmTime: empty or malformed → null; boundary midnight ok', () => {
  assert.equal(nextAlarmTime('', NOW), null);
  assert.equal(nextAlarmTime(undefined, NOW), null);
  assert.equal(nextAlarmTime('25:00', NOW), null);
  assert.equal(nextAlarmTime('7:30', NOW), null, '非 HH:MM 两位格式拒绝');
  assert.equal(nextAlarmTime('00:00', NOW), new Date(2026, 8, 20, 0, 0, 0, 0).getTime());
});

test('alarmStatePatch maps the two names onto state flips (§3.2)', () => {
  assert.deepEqual(alarmStatePatch(ALARM_ON), { state: 'dark' });
  assert.deepEqual(alarmStatePatch(ALARM_OFF), { state: 'light' });
  assert.equal(alarmStatePatch('anything-else'), null);
});

function alarmsDouble() {
  const created = []; const cleared = []; let clearedAll = 0;
  return {
    created, cleared,
    get clearedAll() { return clearedAll; },
    create: (name, opts) => created.push({ name, when: opts.when }),
    clear: (name, cb) => { cleared.push(name); cb?.(true); },
    clearAll: (cb) => { clearedAll++; cb?.(true); },
  };
}
const settings = (over = {}) => ({ schedule: { enabled: true, onTime: '20:00', offTime: '07:00', ...over } });

test('syncAlarms enabled: clears both names then creates one-shot alarms for set times (§3.2)', () => {
  const d = alarmsDouble();
  syncAlarms(settings(), d);
  assert.deepEqual(d.cleared.sort(), [ALARM_OFF, ALARM_ON]);
  assert.equal(d.created.length, 2);
  assert.ok(d.created.every((a) => typeof a.when === 'number' && a.when > 0));
});

test('syncAlarms: empty time → that direction is simply not created (§3.3)', () => {
  const d = alarmsDouble();
  syncAlarms(settings({ offTime: '' }), d);
  assert.equal(d.created.length, 1);
  assert.equal(d.created[0].name, ALARM_ON);
});

test('syncAlarms disabled: clearAll only', () => {
  const d = alarmsDouble();
  syncAlarms(settings({ enabled: false }), d);
  assert.equal(d.clearedAll, 1);
  assert.equal(d.created.length, 0);
});

test('syncAlarms: no alarms API (permission absent) is a no-op', () => {
  assert.doesNotThrow(() => syncAlarms(settings(), undefined));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/schedule.test.mjs`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/shared/schedule.js`**

```js
// src/shared/schedule.js
// 定时纯决策面（M3-BEHAVIOR §3）：一次性 when-alarm、今日/次日计算、触发即写
// state（与手动切换同链路）。无补判——跨重启补发交给 Chrome alarm 语义（§3.3）。
export const ALARM_ON = 'nv-schedule-on';
export const ALARM_OFF = 'nv-schedule-off';

const DAY_MS = 86400000;

export function nextAlarmTime(hhmm, now = Date.now()) {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  const d = new Date(now);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0).getTime();
  return at > now ? at : at + DAY_MS;
}

export function alarmStatePatch(name) {
  if (name === ALARM_ON) return { state: 'dark' };
  if (name === ALARM_OFF) return { state: 'light' };
  return null;
}

// settings 变化 / SW 启动时调用。alarms 缺省（未授权）→ no-op，镜像原版的
// `if (chrome.alarms)` 守卫。
export function syncAlarms(s, alarms = globalThis.chrome?.alarms) {
  if (!alarms || !s?.schedule) return;
  if (!s.schedule.enabled) { alarms.clearAll(); return; }
  const arm = (name, time) => {
    if (time === null) return;
    alarms.clear(name, () => alarms.create(name, { when: time }));
  };
  arm(ALARM_ON, nextAlarmTime(s.schedule.onTime));
  arm(ALARM_OFF, nextAlarmTime(s.schedule.offTime));
}
```

- [ ] **Step 4: 接线 `src/background/main.js`**（文件尾部追加）

```js
// ---- M3 Schedule（M3-BEHAVIOR §3）：一次性 alarm，触发即走 saveSettings 全链 ----
import { ALARM_ON, ALARM_OFF, alarmStatePatch, syncAlarms } from '../shared/schedule.js';

// state 写入会经 subscribeSettings 再次 syncAlarms —— 触发后自动重排次日。
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    const patch = alarmStatePatch(alarm.name);
    if (patch) saveSettings(patch);
  });
  chrome.runtime.onStartup.addListener(() => { loadSettings().then(syncAlarms); });
  chrome.runtime.onInstalled.addListener(() => { loadSettings().then(syncAlarms); });
}
loadSettings().then(syncAlarms);
```

（import 声明按文件既有风格上移到顶部 import 块；`subscribeSettings` 已在文件内注册——在其回调里追加 `syncAlarms(s)`，即 toolbar/menu 刷新那一行所在函数。）

- [ ] **Step 5: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/shared/schedule.js dark-mode/nightveil/src/background/main.js dark-mode/nightveil/tests/unit/schedule.test.mjs
git commit -m "feat(m3): daily schedule — one-shot alarms, state flips ride the settings bus"
```

---

### Task 8: 选项页（II 区新块 + III/VII 填充 + 字号 + 分区折叠）

**Files:**
- Create: `src/shared/optionsM3.js`（控件表 + 纯辅助）
- Modify: `src/options/main.js`（渲染 + 同步）
- Modify: `src/shared/strings.js`（新文案 key）
- Modify: `extension/options.html:8-16, 25-31`（font-size 变量 + 默认 open 调整）
- Test: Create `tests/unit/options-m3.test.mjs`

**Interfaces:**
- Consumes: Task 1 全部新键；Task 2 `GUARD_MODES`；`save`/`current`/`el`/`note`/`section`（options/main.js 既有内部件）。
- Produces:
  ```js
  // src/shared/optionsM3.js
  export const SECTION_ORDER = ['sec-themes', 'sec-options', 'sec-usercss', 'sec-engine', 'sec-exclusion', 'sec-inclusion', 'sec-schedule'];
  export const sectionKeyOf = (sectionId) => sectionId.slice('sec-'.length); // 'sec-usercss' → 'usercss'
  export const FLASHGUARD_MODES = [ { value: 'simple-dark', labelKey: 'guardModeSimpleLabel' }, { value: 'hide', labelKey: 'guardModeHideLabel' }, { value: 'brightness', labelKey: 'guardModeBrightnessLabel' } ];
  export function parseHostList(text);        // 换行切分 → trim → 去空 → 去重（nightveil 列表约定）
  export function clampNumber(value, min, max, fallback); // 空值 → fallback（不落盘脏值）
  ```

- [ ] **Step 1: 写失败测试** `tests/unit/options-m3.test.mjs`

```js
// tests/unit/options-m3.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTION_ORDER, sectionKeyOf, FLASHGUARD_MODES, parseHostList, clampNumber } from '../../src/shared/optionsM3.js';

test('SECTION_ORDER mirrors the seven details ids in options.html order', () => {
  assert.deepEqual(SECTION_ORDER, ['sec-themes', 'sec-options', 'sec-usercss', 'sec-engine', 'sec-exclusion', 'sec-inclusion', 'sec-schedule']);
  assert.equal(sectionKeyOf('sec-usercss'), 'usercss');
});

test('FLASHGUARD_MODES values match settings.flashGuard.mode domain', () => {
  assert.deepEqual(FLASHGUARD_MODES.map((m) => m.value), ['simple-dark', 'hide', 'brightness']);
});

test('parseHostList: newline split, trim, drop empties, dedup (nightveil list convention)', () => {
  assert.deepEqual(parseHostList('google.com\n  yahoo.com \ngoogle.com\n\n'), ['google.com', 'yahoo.com']);
});

test('clampNumber: empty → fallback, out-of-range clamps', () => {
  assert.equal(clampNumber('', 10, 22, 13), 13);
  assert.equal(clampNumber('99', 10, 22, 13), 22);
  assert.equal(clampNumber('5', 10, 22, 13), 10);
  assert.equal(clampNumber('15', 10, 22, 13), 15);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/options-m3.test.mjs`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/shared/optionsM3.js`**

```js
// src/shared/optionsM3.js
// M3 选项页的控件表与纯辅助（渲染在 src/options/main.js；本模块 node --test 直测）。
import { STRINGS } from './strings.js';

export const SECTION_ORDER = ['sec-themes', 'sec-options', 'sec-usercss', 'sec-engine', 'sec-exclusion', 'sec-inclusion', 'sec-schedule'];
export const sectionKeyOf = (sectionId) => sectionId.slice('sec-'.length);

export const FLASHGUARD_MODES = [
  { value: 'simple-dark', label: STRINGS.guardModeSimpleLabel },
  { value: 'hide', label: STRINGS.guardModeHideLabel },
  { value: 'brightness', label: STRINGS.guardModeBrightnessLabel },
];

export function parseHostList(text) {
  const list = String(text ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  return [...new Set(list)];
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
```

- [ ] **Step 4: strings.js 追加文案**（并入既有对象，按字母序插到相邻 key 附近；英文）

```js
  // ---- M3（plan 2026-09-19-m3-full-options Task 8）----
  customThemeLabel: 'User CSS',
  guardGroupLabel: 'Flash guard',
  guardModeSimpleLabel: 'Simple dark layer',
  guardModeHideLabel: 'Hide content',
  guardModeBrightnessLabel: 'Brightness dim',
  guardDelayLabel: 'Dismiss delay (ms)',
  guardThresholdLabel: 'Light-page threshold (elements)',
  colorTempGroupLabel: 'Color temperature',
  ctRedLabel: 'Red',
  ctGreenLabel: 'Green',
  ctBlueLabel: 'Blue',
  ctOpacityLabel: 'Opacity',
  ctListLabel: 'Color temperature exclusions',
  ctListHint: 'One hostname per line. "www." is ignored; entries must match exactly.',
  documentRootLabel: 'Attach style elements to <html> instead of <head>',
  reattachStylesLabel: 'Re-attach engine styles if a page removes them',
  fontSizeLabel: 'Font size (px)',
  userCssAreaLabel: 'Custom styles (active when the User CSS theme is selected)',
  scheduleOnLabel: 'Dark at',
  scheduleOffLabel: 'Light at',
  schedulePermissionAlert: "The 'alarms' permission is required to be able to set schedules.",
```

同时改两条既有占位文案（M3 落地后语义过期）：

```js
  sectionUserCssNote: 'Write your own dark styles. Select the "User CSS" theme in section I to apply them.',
  sectionScheduleNote: 'Turns dark mode on and off automatically at fixed times each day.',
```

- [ ] **Step 5: options.html 调整**

`<style>` 的 `body {` 规则追加基字号变量：

```css
      body { font-family: system-ui, sans-serif; font-size: var(--font-size, 13px); margin: 0 auto; max-width: 720px; padding: 16px; color: #1a1a1a; }
```

`<details id="sec-themes" open>` 去掉 `open`；`<details id="sec-engine">` 改为 `<details id="sec-engine" open>`（默认开分区= 引擎区，M3-BEHAVIOR §6.2；用户设置随后由 JS 覆盖）。

- [ ] **Step 6: options/main.js 渲染与同步**

1) import 追加：

```js
import { SECTION_ORDER, sectionKeyOf, FLASHGUARD_MODES, parseHostList, clampNumber } from '../shared/optionsM3.js';
import { USER_CSS_THEME_ID } from '../shared/themes.js';
```

2) `renderThemes()` 经典族 fieldset 后追加 custom 席位 radio（与 palette radios 同 name 'themeId'，天然单选互斥）：

```js
  classic.append(el('p', { class: 'hint' }, STRINGS.customThemeLabel), el('div', { class: 'cols' },
    el('label', {}, el('input', { type: 'radio', name: 'themeId', value: USER_CSS_THEME_ID, checked: current.themeId === USER_CSS_THEME_ID }), ` ${STRINGS.customThemeLabel}`)));
```

3) 新增渲染函数（放在 renderPlaceholders 位置，替换之）：

```js
// ---- M3 sections/controls（M3-BEHAVIOR §1/§2/§3/§6）----
function renderGuardControls() {
  const fg = current.flashGuard ?? {};
  const master = el('label', {}, el('input', { type: 'checkbox', id: 'fg-enabled', checked: fg.enabled }), ` ${STRINGS.guardGroupLabel}`);
  const box = el('fieldset', { id: 'fg-controls', disabled: fg.enabled === false }, master,
    ...FLASHGUARD_MODES.map((m) => el('label', {},
      el('input', { type: 'radio', name: 'fgMode', id: `fg-mode-${m.value}`, value: m.value, checked: fg.mode === m.value }), ` ${m.label}`)),
    el('label', {}, `${STRINGS.guardDelayLabel} `, el('input', { type: 'number', id: 'fg-delay', min: '0', max: '10000', value: fg.delayMs })),
    el('label', {}, `${STRINGS.guardThresholdLabel} `, el('input', { type: 'number', id: 'fg-threshold', min: '1', max: '1000000', value: fg.threshold })));
  box.addEventListener('change', (e) => {
    const next = { ...(current.flashGuard ?? {}) };
    if (e.target.id === 'fg-enabled') next.enabled = e.target.checked;
    else if (e.target.name === 'fgMode') next.mode = e.target.value;
    else if (e.target.id === 'fg-delay') next.delayMs = clampNumber(e.target.value, 0, 10000, current.flashGuard.delayMs);
    else if (e.target.id === 'fg-threshold') next.threshold = clampNumber(e.target.value, 1, 1000000, current.flashGuard.threshold);
    else return;
    if ((e.target.id === 'fg-delay' || e.target.id === 'fg-threshold') && e.target.value === '') return; // 空数字不落盘
    current = { ...current, flashGuard: next };
    save({ flashGuard: next });
    document.getElementById('fg-controls').disabled = next.enabled === false;
  });
  return box;
}

function renderColorTempControls() {
  const ct = current.colorTemperature ?? {};
  const slider = (id, label, max, value) => el('label', {}, `${label} `,
    el('input', { type: 'range', id, min: '0', max: String(max), step: '1', value }), ' ',
    el('output', { for: id }, String(value)));
  const master = el('label', {}, el('input', { type: 'checkbox', id: 'ct-enabled', checked: ct.enabled }), ` ${STRINGS.colorTempGroupLabel}`);
  const box = el('fieldset', { id: 'ct-controls', disabled: ct.enabled === false }, master,
    slider('ct-red', STRINGS.ctRedLabel, 255, ct.red),
    slider('ct-green', STRINGS.ctGreenLabel, 255, ct.green),
    slider('ct-blue', STRINGS.ctBlueLabel, 255, ct.blue),
    slider('ct-opacity', STRINGS.ctOpacityLabel, 100, ct.opacity),
    el('p', { class: 'hint' }, STRINGS.ctListLabel),
    el('textarea', { id: 'ct-list', 'data-ct-list': '' }, (ct.excludedHosts ?? []).join('\n')),
    note(STRINGS.ctListHint));
  // 原版滑杆 input 实时存（§6.4）；列表 textarea change 存（nightveil 列表约定）。
  box.addEventListener('input', (e) => {
    if (e.target.type !== 'range') return;
    const next = { ...(current.colorTemperature ?? {}) };
    const k = { 'ct-red': 'red', 'ct-green': 'green', 'ct-blue': 'blue', 'ct-opacity': 'opacity' }[e.target.id];
    if (!k) return;
    next[k] = Number(e.target.value);
    const out = box.querySelector(`output[for="${e.target.id}"]`);
    if (out) out.textContent = e.target.value;
    current = { ...current, colorTemperature: next };
    save({ colorTemperature: next });
  });
  box.addEventListener('change', (e) => {
    if (e.target.id === 'ct-enabled') {
      const next = { ...(current.colorTemperature ?? {}), enabled: e.target.checked };
      current = { ...current, colorTemperature: next };
      save({ colorTemperature: next });
      document.getElementById('ct-controls').disabled = next.enabled === false;
    } else if (e.target.id === 'ct-list') {
      const next = { ...(current.colorTemperature ?? {}), excludedHosts: parseHostList(e.target.value) };
      current = { ...current, colorTemperature: next };
      save({ colorTemperature: next });
    }
  });
  return box;
}

function renderUserCssSection() {
  const ta = el('textarea', { id: 'usercss', rows: '12' }, current.userCss ?? '');
  const box = el('div', {}, el('p', { class: 'hint' }, STRINGS.userCssAreaLabel), ta, note(STRINGS.sectionUserCssNote));
  // 原版 keyup 逐键保存（M3-BEHAVIOR §4.1）。
  ta.addEventListener('keyup', () => save({ userCss: ta.value }));
  section('sec-usercss', STRINGS.sectionUserCssLabel, box);
}

function renderScheduleSection() {
  const sch = current.schedule ?? {};
  const box = el('fieldset', {},
    el('label', {}, el('input', { type: 'checkbox', id: 'sch-enabled', checked: sch.enabled }), ` ${STRINGS.sectionScheduleLabel}`),
    el('label', {}, `${STRINGS.scheduleOnLabel} `, el('input', { type: 'time', id: 'sch-on', value: sch.onTime })),
    el('label', {}, `${STRINGS.scheduleOffLabel} `, el('input', { type: 'time', id: 'sch-off', value: sch.offTime })),
    note(STRINGS.sectionScheduleNote));
  const saveSchedule = (patch) => {
    const next = { ...(current.schedule ?? {}), ...patch };
    current = { ...current, schedule: next };
    save({ schedule: next });
  };
  box.addEventListener('change', (e) => {
    if (e.target.id === 'sch-on') saveSchedule({ onTime: e.target.value });
    else if (e.target.id === 'sch-off') saveSchedule({ offTime: e.target.value });
    else if (e.target.id === 'sch-enabled') {
      if (e.target.checked && writable) {
        // 原版：勾选定开关即请求 alarms 权限，拒绝则回退（M3-BEHAVIOR §3.1）。
        chrome.permissions.request({ permissions: ['alarms'] }, (granted) => {
          if (granted) { saveSchedule({ enabled: true }); }
          else {
            e.target.checked = false;
            window.alert(STRINGS.schedulePermissionAlert);
          }
        });
      } else {
        saveSchedule({ enabled: e.target.checked });
      }
    }
  });
  section('sec-schedule', STRINGS.sectionScheduleLabel, box);
}

// §6.1 字号：number 10-22，change 存，--font-size 变量即时应用。
function renderFontSizeControl() {
  const input = el('input', { type: 'number', id: 'ui-fontsize', min: '10', max: '22', step: '1', value: current.ui?.fontSize ?? 13 });
  const row = el('label', {}, `${STRINGS.fontSizeLabel} `, input);
  input.addEventListener('change', () => {
    if (input.value === '') return; // 空数字不落盘
    const v = clampNumber(input.value, 10, 22, current.ui.fontSize);
    const next = { ...current.ui, fontSize: v };
    current = { ...current, ui: next };
    save({ ui: next });
  });
  return row;
}

// §6.2 分区折叠持久化：details toggle → ui.sectionOpen 补丁。
function applySectionState() {
  for (const id of SECTION_ORDER) {
    const d = document.getElementById(id);
    if (!d) continue;
    d.open = Boolean(current.ui?.sectionOpen?.[sectionKeyOf(id)]);
    d.addEventListener('toggle', () => {
      if (!writable) return;
      const next = { ...current.ui, sectionOpen: { ...(current.ui?.sectionOpen ?? {}), [sectionKeyOf(id)]: d.open } };
      current = { ...current, ui: next };
      save({ ui: next });
    });
  }
}
function applyFontSize(v) {
  document.documentElement.style.setProperty('--font-size', `${v}px`);
}
```

4) `renderBehavior()` 的 `section('sec-options', ...)` 调用改为挂入新块：

```js
  section('sec-options', STRINGS.sectionOptionsLabel,
    box, rules,
    renderGuardControls(),
    renderColorTempControls(),
    el('fieldset', {},
      el('label', {}, el('input', { type: 'checkbox', 'data-m3key': 'documentRoot', checked: current.documentRoot }), ` ${STRINGS.documentRootLabel}`),
      el('label', {}, el('input', { type: 'checkbox', 'data-m3key': 'reattachStyles', checked: current.reattachStyles }), ` ${STRINGS.reattachStylesLabel}`),
      renderFontSizeControl()));
  box.addEventListener('change', (e) => {
    if (onEngineControlChange(e)) return;
    if (e.target.name === 'state') save({ state: e.target.value });
    else if (e.target.getAttribute('data-key')) save({ [e.target.getAttribute('data-key')]: e.target.checked });
    else if (e.target.getAttribute('data-m3key')) save({ [e.target.getAttribute('data-m3key')]: e.target.checked });
  });
```

（`data-m3key` 委托挂在既有 box 的 change 监听里，如上追加一个分支即可。）

5) `renderAll()` 替换 `renderPlaceholders()`：

```js
  renderUserCssSection();
  renderScheduleSection();
  applySectionState();
  applyFontSize(current.ui?.fontSize ?? 13);
```

并删除 `renderPlaceholders` 函数。

6) `syncFromSettings(s)` 末尾追加：

```js
  // ---- M3 sync ----
  applyFontSize(s.ui?.fontSize ?? 13);
  const fgNode = document.getElementById('fg-enabled');
  if (fgNode) {
    const fg = s.flashGuard ?? {};
    fgNode.checked = fg.enabled !== false;
    document.getElementById('fg-controls').disabled = fg.enabled === false;
    for (const i of document.querySelectorAll('input[name="fgMode"]')) i.checked = i.value === fg.mode;
    if (document.activeElement?.id !== 'fg-delay') document.getElementById('fg-delay').value = fg.delayMs;
    if (document.activeElement?.id !== 'fg-threshold') document.getElementById('fg-threshold').value = fg.threshold;
  }
  const ctNode = document.getElementById('ct-enabled');
  if (ctNode) {
    const ct = s.colorTemperature ?? {};
    ctNode.checked = Boolean(ct.enabled);
    document.getElementById('ct-controls').disabled = !ct.enabled;
    for (const [id, k] of [['ct-red', 'red'], ['ct-green', 'green'], ['ct-blue', 'blue'], ['ct-opacity', 'opacity']]) {
      const node = document.getElementById(id);
      if (node && document.activeElement !== node) {
        node.value = ct[k];
        const out = document.querySelector(`output[for="${id}"]`);
        if (out) out.textContent = String(ct[k]);
      }
    }
    const list = document.getElementById('ct-list');
    if (list && document.activeElement !== list) list.value = (ct.excludedHosts ?? []).join('\n');
  }
  const schOn = document.getElementById('sch-on');
  if (schOn) {
    document.getElementById('sch-enabled').checked = Boolean(s.schedule?.enabled);
    if (document.activeElement !== schOn) schOn.value = s.schedule?.onTime ?? '';
    const off = document.getElementById('sch-off');
    if (off && document.activeElement !== off) off.value = s.schedule?.offTime ?? '';
  }
  const uc = document.getElementById('usercss');
  if (uc && document.activeElement !== uc) uc.value = s.userCss ?? '';
  for (const i of document.querySelectorAll('#sec-options input[data-m3key]')) {
    i.checked = Boolean(s[i.getAttribute('data-m3key')]);
  }
  const fs = document.getElementById('ui-fontsize');
  if (fs && document.activeElement !== fs) fs.value = s.ui?.fontSize ?? 13;
  for (const id of SECTION_ORDER) {
    const d = document.getElementById(id);
    if (d) d.open = Boolean(s.ui?.sectionOpen?.[sectionKeyOf(id)]);
  }
```

- [ ] **Step 7: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿；strings-source 测试过（新 key 全部走 STRINGS）。

- [ ] **Step 8: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/shared/optionsM3.js dark-mode/nightveil/src/shared/strings.js dark-mode/nightveil/src/options/main.js dark-mode/nightveil/extension/options.html dark-mode/nightveil/tests/unit/options-m3.test.mjs
git commit -m "feat(m3): options surface — guard/color-temp blocks, user CSS + schedule sections, font size, section-state persistence"
```

---

### Task 9: 右键菜单第三入口（色温排除）

**Files:**
- Modify: `src/shared/actions.js`（menuSpec + menuClickPatch 扩展）
- Modify: `src/background/main.js:21-39`（refreshMenu 三态 + 点击路由）
- Modify: `src/shared/strings.js`（menuExcludeColorTemp）
- Test: `tests/unit/actions.test.mjs`（追加）

**Interfaces:**
- Consumes: Task 1 `settings.colorTemperature.enabled/excludedHosts`；既有 `refreshMenu` / `MENU_ID`。
- Produces:
  ```js
  // src/shared/actions.js
  export const MENU_MODES = { SITE: 'site', COLOR_TEMP: 'color-temp' };
  export function menuSpec(settings);        // dark → {mode:'site'}；light+CT开 → {mode:'color-temp'}；light → {mode:'site'}
  // menuClickPatch(settings, url) 行为扩展：color-temp 模式写 colorTemperature.excludedHosts（精确追加）
  ```

- [ ] **Step 1: 写失败测试**（追加到 `tests/unit/actions.test.mjs`）

```js
// ---- M3 color-temperature menu (plan Task 9; M3-BEHAVIOR §1.4) ----
import { menuSpec } from '../../src/shared/actions.js';

test('menuSpec: light + colorTemperature on → color-temp mode (replaces exclude title)', () => {
  assert.equal(menuSpec({ state: 'light', inclusionMode: false, colorTemperature: { enabled: true } }).mode, 'color-temp');
});

test('menuSpec: light + colorTemperature off → site mode', () => {
  assert.equal(menuSpec({ state: 'light', inclusionMode: false, colorTemperature: { enabled: false } }).mode, 'site');
});

test('menuSpec: dark state never switches to color-temp (menu stays include/exclude)', () => {
  assert.equal(menuSpec({ state: 'dark', inclusionMode: false, colorTemperature: { enabled: true } }).mode, 'site');
  assert.equal(menuSpec({ state: 'dark', inclusionMode: true, colorTemperature: { enabled: true } }).mode, 'site');
});

test('menuClickPatch: color-temp mode appends exact hostname to colorTemperature.excludedHosts', () => {
  const s = { state: 'light', inclusionMode: false,
    colorTemperature: { enabled: true, red: 255, green: 227, blue: 199, opacity: 100, excludedHosts: ['a.com'] } };
  const patch = menuClickPatch(s, 'https://www.b.com/page');
  assert.deepEqual(patch.colorTemperature.excludedHosts, ['a.com', 'b.com']);
  assert.equal(patch.colorTemperature.enabled, true, '其余色温字段原样保留');
});

test('menuClickPatch: color-temp duplicate hostname → null (no-op)', () => {
  const s = { state: 'light', inclusionMode: false,
    colorTemperature: { enabled: true, excludedHosts: ['b.com'] } };
  assert.equal(menuClickPatch(s, 'https://b.com/'), null);
});

test('menuClickPatch: light + CT on still routes site lists? no — color-temp wins (§1.4)', () => {
  const s = { state: 'light', inclusionMode: false, exclusionList: ['x.com'],
    colorTemperature: { enabled: true, excludedHosts: [] } };
  const patch = menuClickPatch(s, 'https://y.com/');
  assert.deepEqual(patch.colorTemperature.excludedHosts, ['y.com']);
  assert.equal(patch.exclusionList, undefined, '不得误写暗色排除表');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/actions.test.mjs`
Expected: 新 6 例 FAIL。

- [ ] **Step 3: 实现 actions.js**

`menuClickPatch` 之前新增并改造：

```js
// M3 §1.4：菜单三态判定。亮色态 + 色温开 → 色温排除入口顶替暗色排除入口；
// dark 态永远走 include/exclude（原版 common.js:192-226 分支）。
export function menuSpec(settings) {
  if (settings.state === 'light' && settings.colorTemperature?.enabled) {
    return { mode: 'color-temp' };
  }
  return { mode: 'site' };
}

export function menuClickPatch(settings, url) {
  const host = hostnameFromUrl(url);
  if (!host) return null;
  if (menuSpec(settings).mode === 'color-temp') {
    const ct = settings.colorTemperature ?? {};
    const list = ct.excludedHosts ?? [];
    if (list.some((h) => normalizeHostname(h) === host)) return null;
    return { colorTemperature: { ...ct, excludedHosts: [...list, host] } };
  }
  const key = settings.inclusionMode ? 'inclusionList' : 'exclusionList';
  const list = settings[key] ?? [];
  if (hostnameInList(host, list)) return null;
  return { [key]: [...list, host] };
}
```

- [ ] **Step 4: 接线 background/main.js**

strings.js 追加：`menuExcludeColorTemp: 'Exclude from color temperature',`

`refreshMenu` 改为三态（title 决策走 menuSpec）：

```js
let menuTitle = '';
let menuIsColorTemp = false;
function refreshMenu(settings) {
  const spec = menuSpec(settings);
  const isCt = spec.mode === 'color-temp';
  const title = isCt ? STRINGS.menuExcludeColorTemp
    : settings.inclusionMode ? STRINGS.menuIncludeSite : STRINGS.menuExcludeSite;
  if (title === menuTitle && isCt === menuIsColorTemp) return;
  menuTitle = title; menuIsColorTemp = isCt;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title, contexts: ['page'] });
  });
}
```

（`menuClickPatch` 已按 settings 路由，onClicked 监听无需改动；`colorTemperature` 键变更也需刷新菜单——`subscribeSettings` 回调已全量跑 `refreshMenu`，天然覆盖。）

- [ ] **Step 5: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/shared/actions.js dark-mode/nightveil/src/background/main.js dark-mode/nightveil/src/shared/strings.js dark-mode/nightveil/tests/unit/actions.test.mjs
git commit -m "feat(m3): context-menu color-temperature exclude entry in light state"
```

---

### Task 10: User CSS 编辑器（behave-lite）

**Files:**
- Create: `src/options/editor.js`
- Modify: `src/options/main.js`（两个文本域挂 wireEditor）
- Test: Create `tests/unit/editor.test.mjs`

**Interfaces:**
- Consumes: 无（纯函数）；Task 8 的 `#usercss` 文本域与既有 `ENGINE_EXTRA_RULES_CONTROL` 的 extraRules 文本域。
- Produces:
  ```js
  // src/options/editor.js
  // state: { text: string, selStart: number, selEnd: number }
  // ev: { key: string, shiftKey?: boolean }（ctrl/meta/alt 修饰已在 wireEditor 前过滤）
  export function applyEditorKey(state, ev);  // → { text, selStart, selEnd } | null（null = 浏览器默认行为）
  export function wireEditor(textarea);       // keydown 接线：preventDefault + 写回 value + setSelectionRange
  ```

- [ ] **Step 1: 写失败测试** `tests/unit/editor.test.mjs`

```js
// tests/unit/editor.test.mjs
// D4 档（M3-BEHAVIOR §4.2/§11）：Tab 软缩进 2（选区缩进/退缩）、括号/引号自动
// 配对（含包裹选区）、退格删空整对。autoIndent/overwrite/replaceTab 不做。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEditorKey } from '../../src/options/editor.js';

const at = (text, selStart, selEnd = selStart) => ({ text, selStart, selEnd });

test('Tab with no selection inserts two spaces, caret advances', () => {
  assert.deepEqual(applyEditorKey(at('a{}', 1), { key: 'Tab' }), at('a  {}', 3));
});

test('Tab with selection replaces it with indent', () => {
  assert.deepEqual(applyEditorKey(at('aXYb', 1, 3), { key: 'Tab' }), at('a  b', 3));
});

test('Tab with a multiline selection indents every selected line', () => {
  // '.a {\ncolor: red\n}' 选区 [5,17) 覆盖第二、三行
  const r = applyEditorKey(at('.a {\ncolor: red\n}', 5, 17), { key: 'Tab' });
  assert.equal(r.text, '.a {\n  color: red\n  }');
  assert.equal(r.selStart, 9);
  assert.equal(r.selEnd, 20);
});

test('Shift+Tab outdents selected lines by one unit; bare lines unchanged', () => {
  const r = applyEditorKey(at('.a {\n  color: red\n}', 0, 20), { key: 'Tab', shiftKey: true });
  assert.equal(r.text, '.a {\ncolor: red\n}');
});

test('typing an opener inserts the pair, caret between', () => {
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}'], ["'", "'"], ['"', '"'], ['`', '`']]) {
    const r = applyEditorKey(at('a b', 1), { key: open });
    assert.deepEqual(r, at(`a${open}${close} b`, 2), `pair for ${open}`);
  }
});

test('typing an opener around a selection wraps it', () => {
  const r = applyEditorKey(at('aXYZb', 1, 4), { key: '(' });
  assert.deepEqual(r, at('a(XYZ)b', 2, 5));
});

test('Backspace inside an empty pair deletes both, caret between', () => {
  const r = applyEditorKey(at('a()b', 2), { key: 'Backspace' });
  assert.deepEqual(r, at('ab', 1));
});

test('Backspace on a non-pair falls through (null)', () => {
  assert.equal(applyEditorKey(at('axb', 2), { key: 'Backspace' }), null);
  assert.equal(applyEditorKey(at('a(xb', 3), { key: 'Backspace' }), null);
});

test('any other key falls through (null)', () => {
  assert.equal(applyEditorKey(at('ab', 1), { key: 'x' }), null);
  assert.equal(applyEditorKey(at('ab', 1), { key: 'Enter' }), null, 'autoIndent 不做（D4）');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/editor.test.mjs`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/options/editor.js`**

```js
// src/options/editor.js
// behave-lite（M3-BEHAVIOR §4.2，D4 档）：Tab 软缩进（2 空格，选区逐行缩进/
// Shift+Tab 退缩）、括号与引号自动配对（选区包裹）、退格删空整对。
// 纯函数核心 applyEditorKey 便于直测；wireEditor 负责 DOM 接线。
const INDENT = '  ';
const PAIRS = { '(': ')', '[': ']', '{': '}', "'": "'", '"': '"', '`': '`' };

export function applyEditorKey(state, ev) {
  const { text } = state;
  const s = Math.min(state.selStart, state.selEnd);
  const e = Math.max(state.selStart, state.selEnd);
  if (ev.key === 'Tab') {
    // 单行/无选区：插入（或替换为）一个缩进单位；跨行选区 / Shift+Tab：逐行缩进/退缩。
    const multiline = text.slice(s, e).includes('\n');
    if (multiline || ev.shiftKey) return indentSelection(text, s, e, Boolean(ev.shiftKey));
    return { text: text.slice(0, s) + INDENT + text.slice(e), selStart: s + INDENT.length, selEnd: s + INDENT.length };
  }
  if (ev.key === 'Backspace' && s === e && s > 0) {
    const before = text[s - 1];
    const after = text[s];
    if (PAIRS[before] && PAIRS[before] === after) {
      return { text: text.slice(0, s - 1) + text.slice(s + 1), selStart: s - 1, selEnd: s - 1 };
    }
    return null;
  }
  if (PAIRS[ev.key] && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    if (s !== e) {
      const inner = text.slice(s, e);
      return { text: text.slice(0, s) + ev.key + inner + PAIRS[ev.key] + text.slice(e), selStart: s + 1, selEnd: e + 1 };
    }
    return { text: text.slice(0, s) + ev.key + PAIRS[ev.key] + text.slice(s), selStart: s + 1, selEnd: s + 1 };
  }
  return null;
}

function indentSelection(text, s, e, outdent) {
  const lineStart = text.lastIndexOf('\n', s - 1) + 1;
  const seg = text.slice(lineStart, e);
  const lines = seg.split('\n');
  const updated = lines.map((l) => (outdent ? (l.startsWith(INDENT) ? l.slice(INDENT.length) : l) : INDENT + l));
  const joined = updated.join('\n');
  const next = text.slice(0, lineStart) + joined + text.slice(e);
  // 退缩时选区起点最多退到行首；缩进时整体前移一个单位。
  const delta = outdent
    ? Math.max(joined.length - seg.length, -(s - lineStart))
    : INDENT.length * lines.length;
  return { text: next, selStart: Math.max(lineStart, s + delta), selEnd: lineStart + joined.length };
}

export function wireEditor(textarea) {
  textarea.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key !== 'Tab' && ev.key !== 'Backspace' && !PAIRS[ev.key]) return;
    const next = applyEditorKey(
      { text: textarea.value, selStart: textarea.selectionStart, selEnd: textarea.selectionEnd },
      ev,
    );
    if (!next) return;
    ev.preventDefault();
    textarea.value = next.text;
    textarea.setSelectionRange(next.selStart, next.selEnd);
  });
}
```

- [ ] **Step 4: 跑测试通过**

Run: `node --test tests/unit/editor.test.mjs`
Expected: 9 PASS。

- [ ] **Step 5: 挂接两个文本域**——`src/options/main.js`

import 追加：

```js
import { wireEditor } from './editor.js';
```

`renderUserCssSection()` 内 `ta.addEventListener('keyup', ...)` 之后：`wireEditor(ta);`
`extraRulesBox()`（M2c 既有）内 textarea 构建后同样 `wireEditor(ta)`——将该函数里的 textarea 提为局部变量再挂。

- [ ] **Step 6: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/options/editor.js dark-mode/nightveil/src/options/main.js dark-mode/nightveil/tests/unit/editor.test.mjs
git commit -m "feat(m3): behave-lite editor — soft tabs, pair completion, pair backspace on both CSS textareas"
```

---

### Task 11: 全量回归 + 台账收尾

**Files:**
- Modify: `docs/MILESTONES.md`（M3 条目进度注记，不勾验收）
- Modify: `../../.superpowers/sdd/progress.md`（M3 段开账记录）

**Interfaces:**
- Consumes: Task 1-10 全部产出。
- Produces: 绿色全量测试证据 + 文档注记（验收仍走 /tabbit + 用户，不在本计划内）。

- [ ] **Step 1: 全量测试**

Run: `cd /Users/zero/Project/chromeStore/dark-mode/nightveil && npm test`
Expected: 全绿。记录测试总数（162 + 本计划新增 ≈ 190+，以实际输出为准）。

- [ ] **Step 2: 构建三入口**

Run: `npm run build`
Expected: 零错误；`extension/content.js`、`extension/background.js`、`extension/options.js` 均更新。

- [ ] **Step 3: 防抄袭自检（既有纪律）**

Run: `grep -rn -E "temporarilyaction|colortemperature-whitelist|dark-mode-custom-style|dark_" src/ | grep -v "M3-BEHAVIOR\|原版" || true`
Expected: 零命中（nightveil 命名空间内不得出现原版键名）。

- [ ] **Step 4: 文档注记**

`docs/MILESTONES.md` M3 表行状态改 🟨，追加一行注记（日期 + 「实现完成，/tabbit 验收待跑」）。
`.superpowers/sdd/progress.md` 追加：

```markdown
## M3 (plan: nightveil/docs/superpowers/plans/2026-09-19-m3-full-options.md)
M3 Tasks 1-11: complete (实现+单测全绿；/tabbit 真机验收与终审待跑)
```

（逐任务完成时也可即时追加台账行；本步保证收尾时至少有上述汇总。）

- [ ] **Step 5: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/docs/MILESTONES.md dark-mode/.superpowers/sdd/progress.md
git commit -m "docs(m3): implementation complete pending tabbit acceptance"
```

---

## Self-Review 记录

- **覆盖对照**：M3-BEHAVIOR §1 色温→Task 3/9；§2 guard→Task 2；§3 定时→Task 7/8；§4 User CSS→Task 4/8/10；§5 杂项→Task 5（nativerecheck 已交付仅复核，无任务）；§6 选项页→Task 8；§7 引擎债→Task 6；§8 映射→Task 1；§9 交互面→验收断言点（/tabbit 阶段）；§10 怪癖 14 条→分嵌各任务测试。
- **类型一致**：`settings.flashGuard.mode` 枚举三值在 Task 1/2/8 一致；`alarmStatePatch`/`ALARM_ON|OFF` 在 Task 7 内自洽；`baseCssForTheme(themeId, userCss, siteUsable)` 三参在 Task 4 测试与实现一致。
- **占位符扫描**：无 TBD/TODO；Task 5 的 `makeDocumentStub` 指向既有文件内 stub 模式并给出字段清单（该文件已有同形状 stub，实现者对照裁剪）。
