# NightVeil M1b（生效边界与选项页）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让暗色效果有"边界"且可配置——右键菜单 Exclude/Include、Exclusion List/Rules、Inclusion Mode + Per-site Toggle、10 个 Site Theme、40 主题的选项页七分区框架（自动保存 + Reset），并补齐验收 fixture 与路径遍历回归。

**Architecture:** 判定逻辑全部沉到 `src/shared/` 纯函数（scope 域名匹配 / exclusionRules 规则引擎 / actions 点击决策 / siteThemes 站点样式表），三端复用：content 在 document_start 做「全局状态 × 站点列表 × 页面规则」三重门控后注入 classic + site 两层样式；background 只包装 chrome API（右键菜单、工具栏）；options 页数据驱动渲染全部控件、改动即 `saveSettings`。状态仍是单一存储对象 + `storage.onChanged` 广播，无新增消息协议。

**Tech Stack:** 既有 M0/M1a 底座（Node ≥20、esbuild、node:test、/tabbit 验收），无新依赖、无 manifest 改动。

## Global Constraints

- 工作目录：`/Users/zero/Project/chromeStore/dark-mode/nightveil`（git 根 `/Users/zero/Project/chromeStore`，分支 `develop` 直接提交）
- **防拷贝红线（ADR-0003）**：不打开原版插件源码参照；站点主题选择器凭公开常识自写，不得照抄原版资产；设计层行为（右键菜单非包含模式只显示 Exclude、菜单只加不删）忠实照抄
- **存储 schema v2（单一对象，键 `nightveil.settings`）**，默认值精确为：
  ```js
  {
    state: 'light', themeId: 'nv-simple',
    inclusionMode: false, perSiteToggle: false,
    exclusionList: [], inclusionList: [], disabledSiteThemes: [],
    exclusionRules: {
      metaScheme: true, darkBackground: false, brightnessThreshold: 50,
      htmlAttributes: 'data-theme=dark', htmlClasses: 'dark,darkmode', cookies: '',
    },
  }
  ```
- **文案单源**：`src/` 运行时文案只能来自 `src/shared/strings.js`；站点主题 label 与 palette label 同属数据文件（沿用 M1a 惯例，不算散落文案）；静态文件锁定测试保持绿
- 现有 16 个测试必须保持绿（本计划明确要求改动的断言除外）；`npm test` = `node --test`
- `extension/` 是构建产物不手改；改 `src/`/`public/` 后必须 `npm run build` 才验收；复现/验证前先重新构建（2026-09-12 流程教训）
- **manifest 不改**：`contextMenus` 权限已声明；`chrome.action.onClicked` 回调的 `tab.url` 经既有 `host_permissions: <all_urls>` 可读，无需 `tabs` 权限
- **多写者纪律（M1a 遗留注记的落地）**：`saveSettings` 在各自 context 内串行化（写链）；跨 context last-writer-wins 残余竞态 v1 接受并在代码注释记录（两个写者字段基本不相交：background 写 state/两列表，options 写全量）
- 提交信息 conventional commits + `Co-Authored-By: Claude Code <noreply@anthropic.com>` 尾注
- tabbit 已知限制（自主迭代.md）：`chrome://`、`chrome-extension://`、`file://` 被拦；扩展重载与工具栏点击需用户人工配合；options 页 http 挂载验证用 preview 模式（见 Task 10）

## 设计决策（本计划锁定的规格缺口）

里程碑条目未细化的行为，按下表锁定（评审时重点看这节）：

| # | 决策 | 理由 |
|---|---|---|
| D1 | **Site Theme = 叠加在 classic 之上的精修层**，不替代 classic | 单独一个手写样式表不可能完整转暗；叠加保证关掉/失效也只是少了精修，页面仍暗。靠 `html[data-nv-site]` 前缀 + `:is(#nv-sheet, *)` 提升器 + `!important` 压过 classic 的 ID 级特异性 |
| D2 | 右键菜单**只加不删**（已列入排除后再点无效果，取消只能进设置页） | BACKLOG 记录的原版设计缺陷，复刻期忠实保留 |
| D3 | 域名匹配：`normalizeHostname`（小写、去 `www.`）后**点边界后缀匹配**——条目 `github.com` 覆盖自身与全部子域 | 友好且可预期；菜单/工具栏存"所见主机名"（如 `gist.github.com` 存原样），不做注册域猜测 |
| D4 | Per-site 工具栏切换：点击把当前主机名加入/移出 inclusionList；移除时连带删除管辖它的父条目（子/兄弟条目保留） | CONTEXT.md 语义；父条目管辖时精确删除会变成无操作 |
| D5 | 排除规则默认：metaScheme 开、darkBackground 关（阈值 50）、htmlAttributes `'data-theme=dark'`、htmlClasses `'dark,darkmode'`、cookies 空 | 自动识别"原生暗页"是功能卖点；亮度探测成本高默认关 |
| D6 | `color-scheme` 判定：content 为 `dark` 或 `only dark` 才跳过；`light dark`（双模式声明）**不**跳过 | 双模式页默认渲染浅色，仍需我们转暗（否则 github 等站会被误跳过） |
| D7 | Inclusion Mode 下全局 state 仍是总闸（state=light 时一切不生效） | 与"全局开关"语义一致，工具栏在非 per-site 模式仍切全局 |
| D8 | options 页在 chrome.storage 不可用时渲染**禁用预览态**（默认值 + pointer-events:none + 提示行） | 让 fixtures http 挂载可验证渲染（tabbit 拦 chrome-extension://）；顺带优雅降级 |
| D9 | Flash Guard 底色取当前 palette（overlay 族 `colors.bg`；invert 族保持中性 `#1e2229`） | M1a 终审遗留项：invert 最终靠滤镜变暗，中性守卫即可 |

## 文件结构（本计划涉及）

```
src/shared/
  strings.js          # 文案（扩 ~30 键，分三批：菜单 / 框架+I 区 / II·V·VI 区）
  settings.js         # v2 schema + 写链串行化
  themes.js           # + guardBackgroundFor(palette)
  scope.js            # 新增：normalizeHostname / hostnameInList / siteDarkActive
  exclusionRules.js   # 新增：parseList / luminanceOf / metaSchemeIsDark / evaluateRules
  actions.js          # 新增：hostnameFromUrl / menuClickPatch / toolbarClickPatch
  siteThemes.js       # 新增：SITE_THEMES(10) / findSiteTheme / matchSiteTheme / compileSiteTheme
src/background/main.js  # 重写：+ 右键菜单 + per-site 工具栏分支
src/content/main.js     # 改造：三重门控 + 规则探测 + 统一 teardown + palette 守卫 + 站点层
public/options.html     # 重写：七分区骨架（静态容器 + 样式，无文案）
src/options/main.js     # 重写：数据驱动渲染 + 自动保存 + Reset + 预览态
tests/fixtures/         # + media / frames / frames-child / vars / native-dark / heavy；index 导航
tests/unit/
  settings.test.mjs       # 改：v2 默认合并 + 写链
  themes.test.mjs         # + guardBackgroundFor
  server.test.mjs         # 改：index 断言 + 路径遍历 403
  scope.test.mjs          # 新增
  exclusion-rules.test.mjs# 新增
  actions.test.mjs        # 新增
  site-themes.test.mjs    # 新增
docs/MILESTONES.md     # 终验后勾选 🅱 条目
```

---

### Task 1: 存储 schema v2 + 写链串行化 + 守卫取色

**Files:**
- Modify: `src/shared/settings.js`
- Modify: `src/shared/themes.js`（文件末尾追加一个导出）
- Modify: `tests/unit/settings.test.mjs`
- Modify: `tests/unit/themes.test.mjs`

**Interfaces:**
- Consumes: M1a 既有 `loadSettings/saveSettings/subscribeSettings/DEFAULT_SETTINGS`
- Produces:
  - `DEFAULT_SETTINGS` 扩为 Global Constraints 中的 v2 全量形状（冻结）
  - `saveSettings(patch, storage?)` 行为不变，但同 context 内并发调用串行执行（后写能看到先写结果）
  - `themes.js`: `export function guardBackgroundFor(palette): string`——overlay 族返回 `palette.colors.bg`，invert 族返回 `'#1e2229'`

- [ ] **Step 1: 写失败测试**

`tests/unit/settings.test.mjs`——第 2 个既有测试的期望对象改为 v2 形状，并追加三个测试：

```js
test('loadSettings returns defaults for missing key and fills missing fields', async () => {
  const mem = new MemoryStorage();
  assert.deepEqual(await loadSettings(mem), DEFAULT_SETTINGS);
  const partial = new MemoryStorage({ [STORAGE_KEY]: { themeId: 'nv-midnight' } });
  assert.deepEqual(await loadSettings(partial), { ...DEFAULT_SETTINGS, themeId: 'nv-midnight' });
});

test('legacy M1a settings object upgrades to full v2 defaults', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { state: 'dark', themeId: 'nv-coffee' } });
  const s = await loadSettings(mem);
  assert.equal(s.state, 'dark');
  assert.equal(s.inclusionMode, false);
  assert.deepEqual(s.exclusionList, []);
  assert.equal(s.exclusionRules.metaScheme, true);
});

test('saveSettings serializes concurrent writers within a context', async () => {
  const mem = new MemoryStorage();
  await Promise.all([
    saveSettings({ state: 'dark' }, mem),
    saveSettings({ themeId: 'nv-owl' }, mem),
  ]);
  const s = await loadSettings(mem);
  assert.equal(s.state, 'dark', 'first concurrent write was lost');
  assert.equal(s.themeId, 'nv-owl');
});
```

（第 1 个测试整段替换为上面的 v2 版；第 3、4 个既有测试不动。）

`tests/unit/themes.test.mjs` 文件末尾追加：

```js
test('guardBackgroundFor uses palette bg for overlay and neutral dark for invert', () => {
  assert.equal(guardBackgroundFor(findPalette('nv-midnight')), findPalette('nv-midnight').colors.bg);
  assert.equal(guardBackgroundFor(findPalette('nv-simple')), '#1e2229');
  assert.equal(guardBackgroundFor(findPalette('nv-inv-soft')), '#1e2229');
});
```

并把首行 import 改为：

```js
import { compileTheme, compileThemeById, guardBackgroundFor } from '../../src/shared/themes.js';
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL——`loadSettings` 返回对象缺 `inclusionMode` 等字段（deepEqual 不等）；`guardBackgroundFor is not a function`；串行化测试中先写丢失

- [ ] **Step 3: 最小实现**

`src/shared/settings.js` 整文件替换为：

```js
// src/shared/settings.js
// Single-object settings store. All extension contexts read/write this shape;
// no request-response messaging is used for state — storage.onChanged is the bus.
// Writers (background toolbar/menu, options page) serialize through writeChain
// per context; cross-context last-writer-wins remains possible (v1 accepted —
// the two writers touch mostly disjoint fields, see M1b plan).
const STORAGE_KEY_VALUE = 'nightveil.settings';

export const STORAGE_KEY = STORAGE_KEY_VALUE;

export const DEFAULT_SETTINGS = Object.freeze({
  state: 'light',          // 'light' | 'dark'
  themeId: 'nv-simple',    // palettes.js id
  inclusionMode: false,    // false = exclusion semantics; true = only listed sites
  perSiteToggle: false,    // inclusion mode + true → toolbar click edits inclusionList
  exclusionList: [],       // hostnames; an entry covers itself and its subdomains
  inclusionList: [],
  disabledSiteThemes: [],  // siteThemes.js ids with the refinement layer off
  exclusionRules: {
    metaScheme: true,               // skip pages declaring a dark color-scheme
    darkBackground: false,          // skip pages whose own bg is already dark
    brightnessThreshold: 50,        // 0-255 luma cut for darkBackground
    htmlAttributes: 'data-theme=dark', // comma list; bare name or name=value on <html>
    htmlClasses: 'dark,darkmode',      // comma list matched against <html> classes
    cookies: '',                       // comma list of cookie names
  },
});

export function defaultStorage() {
  const cs = globalThis.chrome?.storage?.local;
  if (!cs) throw new Error('chrome.storage.local unavailable — pass a storage adapter');
  return cs;
}

function mergeWithDefaults(stored) {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function loadSettings(storage = defaultStorage()) {
  return await new Promise((resolve) => {
    storage.get(STORAGE_KEY_VALUE, (found) => {
      resolve(mergeWithDefaults(found?.[STORAGE_KEY_VALUE]));
    });
  });
}

let writeChain = Promise.resolve();
export async function saveSettings(patch, storage = defaultStorage()) {
  const run = writeChain.then(async () => {
    const merged = mergeWithDefaults({ ...(await loadSettings(storage)), ...patch });
    return await new Promise((resolve) => {
      storage.set({ [STORAGE_KEY_VALUE]: merged }, () => resolve(merged));
    });
  });
  writeChain = run.catch(() => {});
  return run;
}

export function subscribeSettings(callback, storage = defaultStorage()) {
  const listener = (changes) => {
    const change = changes?.[STORAGE_KEY_VALUE];
    if (change?.newValue) callback(mergeWithDefaults(change.newValue));
  };
  storage.onChanged.addListener(listener);
  return () => storage.onChanged.removeListener(listener);
}
```

`src/shared/themes.js` 文件末尾追加：

```js
// Flash-guard backdrop per family (D9): overlay themes guard with their own
// bg; invert themes end up dark via filter, so keep a neutral dark guard.
export function guardBackgroundFor(palette) {
  return palette.family === 'invert' ? '#1e2229' : palette.colors.bg;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（16 + 4 = 20 tests）

- [ ] **Step 5: Commit**

```bash
git add src/shared/settings.js src/shared/themes.js tests/unit/settings.test.mjs tests/unit/themes.test.mjs
git commit -m "feat: settings schema v2 (site lists, rules, site themes) with serialized writes and palette-driven guard backdrop

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 生效边界匹配 scope.js

**Files:**
- Create: `src/shared/scope.js`
- Create: `tests/unit/scope.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export function normalizeHostname(hostname): string`——trim + 小写 + 去开头 `www.`；空输入返回 `''`
  - `export function hostnameInList(hostname, list): boolean`——归一后精确相等或 `.` 边界后缀匹配
  - `export function siteDarkActive(settings, hostname): boolean`——`state==='dark'` 且（inclusionMode ? 在 inclusionList : 不在 exclusionList）

- [ ] **Step 1: 写失败测试**

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL——`Cannot find module '../../src/shared/scope.js'`

- [ ] **Step 3: 最小实现**

```js
// src/shared/scope.js
// Where dark may apply: global state × (inclusion mode ? inclusion list :
// exclusion list). Hostnames compare after normalizeHostname; a list entry
// covers the entry domain itself and all its subdomains (dot-boundary suffix).
export function normalizeHostname(hostname) {
  return String(hostname ?? '').trim().toLowerCase().replace(/^www\./, '');
}

export function hostnameInList(hostname, list) {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  return (list ?? []).some((entry) => {
    const e = normalizeHostname(entry);
    if (!e) return false;
    return host === e || host.endsWith(`.${e}`);
  });
}

export function siteDarkActive(settings, hostname) {
  if (settings.state !== 'dark') return false;
  return settings.inclusionMode
    ? hostnameInList(hostname, settings.inclusionList)
    : !hostnameInList(hostname, settings.exclusionList);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（20 + 3 = 23 tests）

- [ ] **Step 5: Commit**

```bash
git add src/shared/scope.js tests/unit/scope.test.mjs
git commit -m "feat: hostname scope matching for exclusion/inclusion lists

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 排除规则引擎 exclusionRules.js

**Files:**
- Create: `src/shared/exclusionRules.js`
- Create: `tests/unit/exclusion-rules.test.mjs`

**Interfaces:**
- Consumes: 无（纯函数）
- Produces:
  - `export function parseList(text): string[]`——逗号分割、trim、去空
  - `export function luminanceOf(color): number|null`——解析 `rgb()/rgba()` 计算样式字符串为 0-255 感知亮度（0.299/0.587/0.114）；完全透明或不可解析返回 `null`
  - `export function metaSchemeIsDark(content): boolean`——逗号分词后 token 为 `dark` 或 `only dark` 才 true（`light dark` 不算，见 D6）
  - `export function evaluateRules(rules, signals): boolean`——`signals` 形状 `{ metaSchemeDark?, htmlAttrs?: string[], htmlClasses?: string[], cookieNames?: string[], bgLuminance?: number|null }`；对 undefined 规则字段防御性跳过

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/exclusion-rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseList, luminanceOf, metaSchemeIsDark, evaluateRules } from '../../src/shared/exclusionRules.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

test('parseList splits, trims, and drops empties', () => {
  assert.deepEqual(parseList(' data-theme=dark , ,darkmode '), ['data-theme=dark', 'darkmode']);
  assert.deepEqual(parseList(null), []);
});

test('luminanceOf parses rgb/rgba; transparent and junk yield null', () => {
  assert.equal(luminanceOf('rgb(12, 12, 12)'), 12);
  assert.equal(luminanceOf('rgb(255, 255, 255)'), 255);
  assert.equal(luminanceOf('rgba(0, 0, 0, 0)'), null);
  assert.equal(luminanceOf(''), null);
});

test('metaSchemeIsDark excludes dark-only declarations, not dual-mode ones', () => {
  assert.equal(metaSchemeIsDark('dark'), true);
  assert.equal(metaSchemeIsDark(' Dark '), true);
  assert.equal(metaSchemeIsDark('only dark'), true);
  assert.equal(metaSchemeIsDark('light dark'), false);
  assert.equal(metaSchemeIsDark(''), false);
});

test('evaluateRules: default rules skip meta-dark and html signals', () => {
  const r = DEFAULT_SETTINGS.exclusionRules;
  assert.equal(evaluateRules(r, { metaSchemeDark: true }), true);
  assert.equal(evaluateRules(r, { htmlAttrs: ['data-theme=dark'] }), true);
  assert.equal(evaluateRules(r, { htmlClasses: ['darkmode'] }), true);
  assert.equal(evaluateRules(r, {}), false);
  assert.equal(evaluateRules(undefined, { metaSchemeDark: true }), false, 'rules are defensive');
});

test('evaluateRules: dark background honors toggle and threshold', () => {
  const r = { ...DEFAULT_SETTINGS.exclusionRules, darkBackground: true, brightnessThreshold: 50 };
  assert.equal(evaluateRules(r, { bgLuminance: 40 }), true);
  assert.equal(evaluateRules(r, { bgLuminance: 120 }), false);
  assert.equal(evaluateRules(r, { bgLuminance: null }), false);
  assert.equal(evaluateRules(DEFAULT_SETTINGS.exclusionRules, { bgLuminance: 10 }), false, 'toggle off by default');
});

test('evaluateRules: custom attribute and cookie lists replace defaults', () => {
  const r = { ...DEFAULT_SETTINGS.exclusionRules, cookies: 'night_mode, theme', htmlAttributes: 'data-night' };
  assert.equal(evaluateRules(r, { cookieNames: ['night_mode'] }), true);
  assert.equal(evaluateRules(r, { htmlAttrs: ['data-night'] }), true);
  assert.equal(evaluateRules(r, { htmlAttrs: ['data-theme=dark'] }), false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL——`Cannot find module '../../src/shared/exclusionRules.js'`

- [ ] **Step 3: 最小实现**

```js
// src/shared/exclusionRules.js
// Rule engine deciding whether a page signals "already dark / opted out".
// Pure functions only — the content script gathers the DOM/cookie signals and
// calls evaluateRules with them (matching logic stays unit-testable).

export function parseList(text) {
  return String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Perceptual luma 0-255 from an rgb()/rgba() computed-style string.
// Fully transparent colors carry no signal → null.
export function luminanceOf(color) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(String(color ?? ''));
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return Math.round(0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]));
}

// "dark" / "only dark" tokens opt out; "light dark" (both modes supported)
// renders light by default and must NOT opt out (D6).
export function metaSchemeIsDark(content) {
  return String(content ?? '')
    .toLowerCase()
    .split(',')
    .map((t) => t.trim())
    .some((t) => t === 'dark' || t === 'only dark');
}

// signals: { metaSchemeDark, htmlAttrs: string[], htmlClasses: string[],
//            cookieNames: string[], bgLuminance: number|null }
export function evaluateRules(rules, signals = {}) {
  const r = rules ?? {};
  if (r.metaScheme && signals.metaSchemeDark) return true;
  const attrs = parseList(r.htmlAttributes);
  if (attrs.length && (signals.htmlAttrs ?? []).some((a) => attrs.includes(a))) return true;
  const classes = parseList(r.htmlClasses);
  if (classes.length && (signals.htmlClasses ?? []).some((c) => classes.includes(c))) return true;
  const cookies = parseList(r.cookies);
  if (cookies.length && (signals.cookieNames ?? []).some((c) => cookies.includes(c))) return true;
  if (r.darkBackground
      && signals.bgLuminance !== null && signals.bgLuminance !== undefined
      && signals.bgLuminance <= (Number.isFinite(Number(r.brightnessThreshold)) ? Number(r.brightnessThreshold) : 50)) return true;
  return false;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（23 + 6 = 29 tests）

- [ ] **Step 5: Commit**

```bash
git add src/shared/exclusionRules.js tests/unit/exclusion-rules.test.mjs
git commit -m "feat: page exclusion rule engine (meta color-scheme, html/class/cookie, bg luma)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 验收 fixture 扩充（media / frames / vars / native-dark）

**Files:**
- Create: `tests/fixtures/media.html`
- Create: `tests/fixtures/frames.html`
- Create: `tests/fixtures/frames-child.html`
- Create: `tests/fixtures/vars.html`
- Create: `tests/fixtures/native-dark.html`
- Modify: `tests/fixtures/index.html`（整文件替换，heavy 链接留给 Task 6）
- Modify: `tests/unit/server.test.mjs`（index 断言文案同步）

**Interfaces:**
- Consumes: 既有 fixtures 服务（端口 8123）
- Produces: 五张验收页——`media.html`（video/img 舞台标记）、`frames.html`（同源嵌套 + about:blank 帧）、`vars.html`（CSS 变量着色）、`native-dark.html`（自带暗色 + `color-scheme` 声明 + `html.dark`，Task 5 的规则跳过验证页）

- [ ] **Step 1: 写 fixture 文件**

`tests/fixtures/media.html`：

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>NightVeil media fixture</title>
    <style>
      body { font-family: sans-serif; background: #fff; color: #111; }
      .player { width: 640px; margin: 16px; }
      video { width: 640px; height: 360px; background: #000; display: block; }
      .cover { display: inline-block; margin: 8px; }
      .cover img { width: 240px; height: 135px; display: block; }
      .stats { width: 240px; height: 28px; background-image: linear-gradient(to right, rgba(0,179,255,.9), rgba(255,45,85,.9)); }
    </style>
  </head>
  <body>
    <h1>Media fixture</h1>
    <div class="player">
      <video controls poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%23183b56'/%3E%3C/svg%3E"></video>
      <p class="caption">Player wrapper layers must stay transparent in dark mode.</p>
    </div>
    <div class="cover">
      <img alt="cover" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='135'%3E%3Crect width='240' height='135' fill='%234488cc'/%3E%3C/svg%3E">
      <div class="stats">gradient strip must stay a gradient in dark mode</div>
    </div>
  </body>
</html>
```

`tests/fixtures/frames.html`：

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>NightVeil frames fixture</title>
    <style>
      body { font-family: sans-serif; background: #fff; color: #111; }
      iframe { width: 480px; height: 200px; border: 1px solid #999; margin: 8px; }
    </style>
  </head>
  <body>
    <h1>Frames fixture</h1>
    <iframe src="plain.html" title="same-origin child"></iframe>
    <iframe src="frames-child.html" title="nested parent"></iframe>
    <iframe title="about:blank child"></iframe>
  </body>
</html>
```

`tests/fixtures/frames-child.html`：

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>NightVeil nested child fixture</title>
    <style>
      body { font-family: sans-serif; background: #fff; color: #111; }
      iframe { width: 400px; height: 120px; border: 1px solid #999; }
    </style>
  </head>
  <body>
    <p>Nested child frame embedding plain.html:</p>
    <iframe src="plain.html" title="grandchild"></iframe>
  </body>
</html>
```

`tests/fixtures/vars.html`：

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>NightVeil CSS variables fixture</title>
    <style>
      :root {
        --page-bg: #ffffff;
        --page-fg: #1a1a1a;
        --card-bg: #f4f6f8;
        --card-border: #d0d7de;
        --accent: #0969da;
      }
      body { font-family: sans-serif; background: var(--page-bg); color: var(--page-fg); }
      .card { background: var(--card-bg); border: 1px solid var(--card-border); padding: 12px; margin: 8px; }
      .card a { color: var(--accent); }
      .deep .inner .leaf { background: var(--card-bg); color: var(--page-fg); padding: 8px; }
    </style>
  </head>
  <body>
    <h1>CSS variables fixture</h1>
    <div class="card">Card painted via <code>--card-bg</code>. <a href="#">Accent link</a>.</div>
    <div class="deep"><div class="inner"><div class="leaf">Leaf using the same vars through nesting.</div></div></div>
  </body>
</html>
```

`tests/fixtures/native-dark.html`：

```html
<!DOCTYPE html>
<html lang="en" class="dark" data-theme="dark">
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="dark">
    <title>NightVeil native-dark fixture</title>
    <style>
      body { font-family: sans-serif; background: #121212; color: #e6e6e6; }
      .card { background: #1e1e1e; border: 1px solid #333; padding: 12px; margin: 8px; }
      a { color: #8ab4f8; }
    </style>
  </head>
  <body>
    <h1>Native dark fixture</h1>
    <p>This page is already dark and declares it — NightVeil must leave it untouched.</p>
    <div class="card">Card with native dark styling. <a href="#">Link</a></div>
  </body>
</html>
```

`tests/fixtures/index.html` 整文件替换：

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>NightVeil fixtures</title>
  </head>
  <body style="background: #fff; color: #111">
    <h1>NightVeil fixtures</h1>
    <ul>
      <li><a href="plain.html">plain — core toggle acceptance</a></li>
      <li><a href="media.html">media — video/cover stage marking</a></li>
      <li><a href="frames.html">frames — nested same-origin frames</a></li>
      <li><a href="vars.html">vars — CSS custom properties</a></li>
      <li><a href="native-dark.html">native-dark — exclusion rules skip</a></li>
    </ul>
  </body>
</html>
```

- [ ] **Step 2: 同步 server 测试断言**

`tests/unit/server.test.mjs` 中 `assert.match(await res.text(), /Fixture stub/);` 改为：

```js
    assert.match(await res.text(), /NightVeil fixtures/);
```

- [ ] **Step 3: 运行确认通过**

Run: `npm test`
Expected: PASS（29 tests，server 测试适配新 index）

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/media.html tests/fixtures/frames.html tests/fixtures/frames-child.html tests/fixtures/vars.html tests/fixtures/native-dark.html tests/fixtures/index.html tests/unit/server.test.mjs
git commit -m "test: fixtures for media stages, nested frames, css vars, and native-dark skip

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: content 管线接入三重门控（本计划核心改造）

**Files:**
- Modify: `src/content/main.js`（整文件替换）

**Interfaces:**
- Consumes: Task 1 `guardBackgroundFor`、Task 2 `siteDarkActive`、Task 3 `evaluateRules/luminanceOf/metaSchemeIsDark`
- Produces: content 行为契约——渲染前先过 `siteDarkActive(settings, location.hostname)` 与 `evaluateRules(settings.exclusionRules, signals)`；探测分两拍（document_start 静态信号；DOM 就绪后补 body 背景亮度并复查，发现豁免即整体拆除）；`teardown()` 统一移除 classic/guard/舞台标记。站点层（nv-site）在 Task 8 加入

- [ ] **Step 1: 替换实现**

`src/content/main.js` 整文件替换为（markMediaStages / markFullscreenOverlays / recallZeroSizeText / injectStyle / removeStyle 与 M1a 相同，原样保留）：

```js
// src/content/main.js
// Content pipeline: read settings at document_start, gate on scope (global
// state × site lists) and page exclusion rules, then inject/remove the
// classic theme, apply a flash guard while active, and re-render on changes.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, subscribeSettings } from '../shared/settings.js';
import { compileThemeById, guardBackgroundFor } from '../shared/themes.js';
import { findPalette } from '../shared/palettes.js';
import { siteDarkActive } from '../shared/scope.js';
import { evaluateRules, luminanceOf, metaSchemeIsDark } from '../shared/exclusionRules.js';

const CLASSIC_STYLE_ID = 'nv-classic';
const GUARD_STYLE_ID = 'nv-guard';
const GUARD_REMOVE_DELAY_MS = 200;
const STAGE_ATTR = 'data-nv-stage';

console.log(STRINGS.contentActiveLog);

function injectStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    (document.head ?? document.documentElement).appendChild(el);
  }
  el.textContent = css;
}

function removeStyle(id) {
  document.getElementById(id)?.remove();
}

let guardTimer = null;
function armGuard(settings) {
  const bg = guardBackgroundFor(findPalette(settings.themeId));
  injectStyle(GUARD_STYLE_ID, `html { background-color: ${bg} !important; }`);
  if (guardTimer) clearTimeout(guardTimer);
  const dismiss = () => removeStyle(GUARD_STYLE_ID);
  if (document.readyState === 'complete') {
    guardTimer = setTimeout(dismiss, GUARD_REMOVE_DELAY_MS);
  } else {
    window.addEventListener('load', () => { guardTimer = setTimeout(dismiss, GUARD_REMOVE_DELAY_MS); }, { once: true });
  }
}

function clearVideoStages() {
  for (const el of document.querySelectorAll(`[${STAGE_ATTR}]`)) el.removeAttribute(STAGE_ATTR);
}

// Mark the wrapper layers directly around media (<video> players and <img>
// cover cards) so overlay flattening keeps them transparent — otherwise
// originally-transparent layers (player danmaku/subtitles/controls, or card
// stats strips whose gradient background-IMAGE needs a transparent backdrop)
// paint opaque over the media. Known v1 limitation: media added later by an
// SPA are only marked on the next render.
function markMediaStages() {
  clearVideoStages();
  const mark = (start, maxW, maxH) => {
    let el = start;
    for (let i = 0; i < 8 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect();
      if (r.width > maxW || r.height > maxH) break;
      el.setAttribute(STAGE_ATTR, '');
      el = el.parentElement;
    }
  };
  for (const v of document.querySelectorAll('video')) {
    const vr = v.getBoundingClientRect();
    mark(v.parentElement, (vr.width || 1) * 1.5, Infinity);
  }
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 80 || !(img.complete && img.naturalWidth > 0)) continue;
    mark(img.parentElement, r.width * 1.5, r.height * 1.1);
  }
}

// 全屏透明布局层被压平成不透明幕布盖整页——恢复其透明；z<1000 门限避免误伤弹窗遮罩。
function markFullscreenOverlays() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const el of document.querySelectorAll('body *')) {
    if (el.hasAttribute(STAGE_ATTR)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
    const z = parseInt(cs.zIndex) || 0;
    if (z >= 1000) continue;
    el.setAttribute(STAGE_ATTR, '');
  }
}

// 图截文字第二式——字号归零藏字召回。
function recallZeroSizeText() {
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length !== 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.fontSize !== '0px') continue;
    let size = '12px';
    let a = el.parentElement;
    for (let i = 0; i < 6 && a; i++) {
      const fs = getComputedStyle(a).fontSize;
      if (fs !== '0px') { size = fs; break; }
      a = a.parentElement;
    }
    el.style.setProperty('font-size', size, 'important');
  }
}

// ---- page exclusion-rule probes (DOM side; matching logic lives in shared/) ----
function collectRuleSignals(includeBg) {
  const html = document.documentElement;
  const metaSchemeDark = [...document.querySelectorAll('meta[name="color-scheme" i], meta[name="supported-color-schemes" i]')]
    .some((m) => metaSchemeIsDark(m.getAttribute('content')));
  const htmlAttrs = html ? [...html.attributes].map((a) => (a.value === '' ? a.name : `${a.name}=${a.value}`)) : [];
  const htmlClasses = html ? [...html.classList] : [];
  const cookieNames = document.cookie.split(';').map((s) => s.split('=')[0].trim()).filter(Boolean);
  let bgLuminance = null;
  if (includeBg) {
    const el = document.body ?? document.documentElement;
    if (el) bgLuminance = luminanceOf(getComputedStyle(el).backgroundColor);
  }
  return { metaSchemeDark, htmlAttrs, htmlClasses, cookieNames, bgLuminance };
}

function teardown() {
  removeStyle(CLASSIC_STYLE_ID);
  removeStyle(GUARD_STYLE_ID);
  if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }
  clearVideoStages();
}

function applyTheme(settings) {
  armGuard(settings);
  injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));
  markMediaStages();
  markFullscreenOverlays();
  recallZeroSizeText();
  // re-mark once the page finished loading — SPA players mount late.
  window.addEventListener('load', () => {
    if (document.getElementById(CLASSIC_STYLE_ID)) {
      markMediaStages();
      markFullscreenOverlays();
      recallZeroSizeText();
    }
  }, { once: true });
}

function whenDomReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

// Render counter: async callbacks (dom-ready, load) capture the generation
// they were scheduled in and no-op when a newer render superseded them —
// otherwise a stale callback could strip or apply against outdated settings.
let renderGeneration = 0;

function render(settings) {
  const gen = ++renderGeneration;
  const rules = settings.exclusionRules ?? {};
  if (!siteDarkActive(settings, location.hostname)
      || evaluateRules(rules, collectRuleSignals(false))) {
    // Light branch leaves prior dark-pass inline styles in place (harmless);
    // a light reload starts clean — acceptable v1.
    teardown();
    return;
  }
  if (rules.darkBackground) {
    // The page's own bg luma must be measured on its native colors — the
    // classic theme flattens body to our dark (self-trigger) and invert
    // forces white (never-trigger). Hold the guard, decide at DOM ready:
    // strip → measure → re-apply runs in one synchronous task, so there is
    // no paint between teardown and the decision.
    armGuard(settings);
    whenDomReady(() => {
      if (gen !== renderGeneration) return;
      teardown();
      if (evaluateRules(rules, collectRuleSignals(true))) return; // page opts out — stays off
      applyTheme(settings);
    });
    return;
  }
  applyTheme(settings);
  // Late re-check: a dark-scheme meta may sit past the parsed head. Strip if
  // the page opts out late. (bg luma needs the delayed branch above.)
  const lateCheck = () => {
    if (gen !== renderGeneration) return;
    if (document.getElementById(CLASSIC_STYLE_ID)
        && evaluateRules(rules, collectRuleSignals(false))) {
      teardown();
    }
  };
  whenDomReady(lateCheck);
}

loadSettings().then(render);
subscribeSettings(render);
```

- [ ] **Step 2: 单测 + 构建**

Run: `npm test && npm run build`
Expected: PASS（29 tests）+ esbuild 3 个产物无报错

- [ ] **Step 3: tabbit 验证（用户配合重载扩展 + 切 Dark）**

Run: `/tabbit`（fixtures 服务 `npm run fixtures` 已起）
1. 用户重载扩展，工具栏切到 Dark（一次即可，状态持久化）
2. 打开 `http://localhost:8123/plain.html`——断言 `#nv-classic` 存在、body 计算背景为默认主题 `#1e2229`（回归不破坏）
3. 打开 `media.html` / `frames.html` / `vars.html`——断言各自 frame 内 `#nv-classic` 存在、media 页 `.stats` 仍为渐变（background-image 幸存）、console 无未捕获异常
4. 打开 `native-dark.html`——断言 `document.getElementById('nv-classic') === null` 且 `getComputedStyle(document.body).backgroundColor === 'rgb(18, 18, 18)'`（规则跳过生效，页面原生暗色未被覆盖）
5. 切回 Light，重新打开 plain.html——断言 `#nv-classic` 与 `#nv-guard` 均不存在

Expected: 全部通过；任一失败按自主迭代协议回到 Step 1

- [ ] **Step 4: Commit**

```bash
git add src/content/main.js
git commit -m "feat: content pipeline gates on site scope and page exclusion rules

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: heavy fixture + 路径遍历回归断言

**Files:**
- Create: `tests/fixtures/heavy.html`（脚本生成后入库）
- Modify: `tests/fixtures/index.html`（追加 heavy 链接）
- Modify: `tests/unit/server.test.mjs`（追加 403 断言）

**Interfaces:**
- Consumes: Task 4 的 fixtures 服务
- Produces: `heavy.html`（600 卡片 ≈ 4200 节点，深 DOM 性能/M2 基线页）；路径遍历安全回归

- [ ] **Step 1: 生成 heavy.html**

```bash
node -e '
const fs = require("fs");
const card = (i) => `  <section class="card" style="margin:8px;padding:12px;border:1px solid #ddd">
    <h3>Card ${i}</h3>
    <p style="color:#333">Row ${i} paragraph with <a href="#">link ${i}</a> and <cite>ref-${i}</cite>.</p>
    <div class="row" style="display:flex;gap:8px">
      <input placeholder="query ${i}"><button>Go ${i}</button>
    </div>
  </section>`;
const body = Array.from({ length: 600 }, (_, i) => card(i)).join("\n");
fs.writeFileSync("tests/fixtures/heavy.html", `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>NightVeil heavy fixture</title>
    <style>
      body { font-family: sans-serif; background: #fff; color: #222; }
      .card:nth-child(even) { background: #f4f6f8; }
      .card:hover { border-color: #48f; }
      .row input { border: 1px solid #999; }
    </style>
  </head>
  <body>
    <h1>Heavy fixture — 600 cards</h1>
${body}
  </body>
</html>
`);
'
```

- [ ] **Step 2: index 追加链接**

`tests/fixtures/index.html` 的 `</ul>` 前加：

```html
      <li><a href="heavy.html">heavy — deep DOM performance</a></li>
```

- [ ] **Step 3: 写路径遍历断言（失败→通过循环：先跑一次确认现服务已 403，若非 403 先修服务再钉测试）**

`tests/unit/server.test.mjs` 的既有 test 内、`const missing = ...` 之前追加：

```js
    // Path-traversal regression (M0 终审遗留): encoded dot-dot must not escape ROOT.
    for (const evil of ['/..%2fpackage.json', '/%2e%2e%2fpackage.json']) {
      const trav = await fetch(`http://localhost:${port}${evil}`);
      assert.equal(trav.status, 403, `${evil} must be rejected`);
    }
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（29 tests，含新断言；若 403 断言失败说明服务被改动，先修复 `serve-fixtures.mjs` 的 ROOT 检查）

- [ ] **Step 5: tabbit 快速确认 heavy 页**

Run: `/tabbit`——Dark 状态下打开 `http://localhost:8123/heavy.html`，断言 `#nv-classic` 存在、console 无未捕获异常、首屏截图正常压平

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/heavy.html tests/fixtures/index.html tests/unit/server.test.mjs
git commit -m "test: heavy fixture page and path-traversal 403 regression assertions

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: 站点主题模块 siteThemes.js

**Files:**
- Create: `src/shared/siteThemes.js`
- Create: `tests/unit/site-themes.test.mjs`

**Interfaces:**
- Consumes: Task 2 `normalizeHostname`
- Produces:
  - `export const SITE_THEMES: Array<{ id, label, hosts: string[], css: string }>`——恰 10 项（google、github、wikipedia、stackoverflow、reddit、amazon、facebook、instagram、twitter、bing）
  - `export function findSiteTheme(id): object|undefined`
  - `export function matchSiteTheme(hostname): object|null`——归一后缀匹配（含子域）
  - `export function compileSiteTheme(id): string|undefined`——返回 `css.trim()`
  - 规则形状契约：每条编译后形如 `html[data-nv-site="<id>"] :is(#nv-sheet, *)<sel> { ... !important }`，保证压过 classic 的 ID 级特异性（D1）。选择器为 v1 初稿，验收轮（Task 12）真实站点抽查后允许调优并提交

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/site-themes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE_THEMES, findSiteTheme, matchSiteTheme, compileSiteTheme } from '../../src/shared/siteThemes.js';

test('ten site themes with unique ids, labels, and hosts', () => {
  assert.equal(SITE_THEMES.length, 10);
  assert.equal(new Set(SITE_THEMES.map((t) => t.id)).size, 10);
  for (const t of SITE_THEMES) {
    assert.ok(t.label, `${t.id} needs a label`);
    assert.ok(t.hosts.length > 0, `${t.id} needs hosts`);
  }
});

test('matchSiteTheme suffix-matches hosts; unknown and localhost stay null', () => {
  assert.equal(matchSiteTheme('www.github.com').id, 'github');
  assert.equal(matchSiteTheme('gist.github.com').id, 'github');
  assert.equal(matchSiteTheme('WWW.Google.COM').id, 'google');
  assert.equal(matchSiteTheme('x.com').id, 'twitter');
  assert.equal(matchSiteTheme('notgithub.com'), null);
  assert.equal(matchSiteTheme('localhost'), null);
  assert.equal(matchSiteTheme(''), null);
});

test('compiled sheets boost every selector segment with the specificity prefix', () => {
  for (const t of SITE_THEMES) {
    const css = compileSiteTheme(t.id);
    for (const rule of css.split('\n')) {
      const brace = rule.indexOf('{');
      assert.ok(brace > 0, `${t.id} malformed rule: ${rule}`);
      const selectorPart = rule.slice(0, brace);
      for (const segment of selectorPart.split(',')) {
        assert.ok(
          segment.trim().startsWith(`html[data-nv-site="${t.id}"]`),
          `${t.id} segment missing booster: ${segment}`,
        );
      }
    }
    assert.match(css, /!important/);
    assert.ok(css.length > 100, `${t.id} sheet too small`);
  }
  assert.equal(findSiteTheme('nope'), undefined);
  assert.equal(compileSiteTheme('nope'), undefined);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL——`Cannot find module '../../src/shared/siteThemes.js'`

- [ ] **Step 3: 实现**

```js
// src/shared/siteThemes.js
// Selector-level dark refinements for 10 high-traffic sites (ADR-0003:
// selectors authored fresh). Layered ON TOP of the classic theme: the content
// script sets <html data-nv-site="<id>"> and injects this sheet after
// nv-classic. The html[data-nv-site] prefix + :is(#nv-sheet, *) booster keeps
// every rule above the classic overlay's ID-level specificity (D1). Selectors
// are v1 drafts — tuned during the acceptance round.
import { normalizeHostname } from './scope.js';

const sheet = (id, rules) => rules
  .map(([sel, body]) => `${sel.split(',').map((s) => `html[data-nv-site="${id}"] :is(#nv-sheet, *)${s}`).join(', ')} { ${body} }`)
  .join('\n');

export const SITE_THEMES = [
  {
    id: 'google', label: 'Google', hosts: ['google.com'],
    css: sheet('google', [
      [' header', 'background-color: #202124 !important;'],
      [' footer', 'background-color: #171717 !important;'],
      [' input', 'background-color: #303134 !important; color: #e8eaed !important;'],
      [' a:visited', 'color: #c58af9 !important;'],
    ]),
  },
  {
    id: 'github', label: 'GitHub', hosts: ['github.com'],
    css: sheet('github', [
      [' .AppHeader, .Header', 'background-color: #010409 !important; border-color: #30363d !important;'],
      [' .Box, .timeline-comment', 'background-color: #0d1117 !important; border-color: #30363d !important;'],
      [' .btn', 'background-color: #212830 !important; border-color: #3d444d !important;'],
      [' table td, table th', 'border-color: #21262d !important;'],
      [' .blob-code, .file', 'background-color: #0d1117 !important;'],
    ]),
  },
  {
    id: 'wikipedia', label: 'Wikipedia', hosts: ['wikipedia.org'],
    css: sheet('wikipedia', [
      [' .infobox, .ambox, .thumb, .navbox, .side-box', 'background-color: #202122 !important; border-color: #383b40 !important;'],
      [' table.wikitable', 'background-color: #101418 !important; border-color: #383b40 !important;'],
      [' #mw-navigation, #mw-header', 'background-color: #101418 !important;'],
      [' .mw-parser-output .hatnote', 'color: #a2a9b1 !important;'],
    ]),
  },
  {
    id: 'stackoverflow', label: 'Stack Overflow', hosts: ['stackoverflow.com'],
    css: sheet('stackoverflow', [
      [' .s-topbar, .top-bar', 'background-color: #2d2d2d !important;'],
      [' .s-post-summary, .question, .answer', 'background-color: #1c1b1b !important;'],
      [' pre, code, .s-code-block', 'background-color: #1d1d1d !important;'],
    ]),
  },
  {
    id: 'reddit', label: 'Reddit', hosts: ['reddit.com'],
    css: sheet('reddit', [
      [' shreddit-header, header', 'background-color: #1a1a1b !important;'],
      [' [data-testid="post-container"]', 'background-color: #1a1a1b !important; border-color: #343536 !important;'],
    ]),
  },
  {
    id: 'amazon', label: 'Amazon', hosts: ['amazon.com'],
    css: sheet('amazon', [
      [' #navbar, #nav-main', 'background-color: #131920 !important;'],
      [' #nav-search .nav-search-field input, #twotabsearchtextbox', 'background-color: #243139 !important; color: #e7e9ec !important;'],
      [' .s-card, .s-result-item', 'background-color: #1a1f25 !important;'],
    ]),
  },
  {
    id: 'facebook', label: 'Facebook', hosts: ['facebook.com'],
    css: sheet('facebook', [
      [' [role="banner"]', 'background-color: #242526 !important;'],
      [' [role="navigation"]', 'background-color: #242526 !important;'],
      [' [role="article"]', 'background-color: #1c1e21 !important; border-color: #3a3b3c !important;'],
    ]),
  },
  {
    id: 'instagram', label: 'Instagram', hosts: ['instagram.com'],
    css: sheet('instagram', [
      [' header, nav', 'background-color: #000000 !important;'],
      [' [role="navigation"]', 'background-color: #000000 !important;'],
      [' article', 'border-color: #262626 !important;'],
    ]),
  },
  {
    id: 'twitter', label: 'X (Twitter)', hosts: ['twitter.com', 'x.com'],
    css: sheet('twitter', [
      [' [data-testid="app-tab-bar"]', 'background-color: #16181c !important; border-color: #2f3336 !important;'],
      [' header', 'background-color: #000000 !important; border-color: #2f3336 !important;'],
      [' [data-testid="cellInnerDiv"]', 'background-color: #000000 !important; border-color: #2f3336 !important;'],
    ]),
  },
  {
    id: 'bing', label: 'Bing', hosts: ['bing.com'],
    css: sheet('bing', [
      [' #b_header', 'background-color: #333333 !important;'],
      [' #b_results > li', 'background-color: #222222 !important;'],
      [' #b_results .b_caption p', 'color: #9aa0a6 !important;'],
    ]),
  },
];

export function findSiteTheme(id) {
  return SITE_THEMES.find((t) => t.id === id);
}

export function matchSiteTheme(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return null;
  return SITE_THEMES.find((t) => t.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

export function compileSiteTheme(id) {
  return findSiteTheme(id)?.css.trim();
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（29 + 3 = 32 tests）

- [ ] **Step 5: Commit**

```bash
git add src/shared/siteThemes.js tests/unit/site-themes.test.mjs
git commit -m "feat: ten site themes as specificity-boosted refinement sheets

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: content 站点层注入

**Files:**
- Modify: `src/content/main.js`（三处精确插入）

**Interfaces:**
- Consumes: Task 7 `matchSiteTheme/compileSiteTheme`、settings `disabledSiteThemes`
- Produces: 生效时 `<html data-nv-site="<id>">` + `#nv-site` 样式表（classic 之后注入）；`teardown()` 连带移除两者

- [ ] **Step 1: 三处编辑**

① import 区追加一行：

```js
import { matchSiteTheme, compileSiteTheme } from '../shared/siteThemes.js';
```

② 常量区 `GUARD_REMOVE_DELAY_MS` 之后追加：

```js
const SITE_STYLE_ID = 'nv-site';
const SITE_ATTR = 'data-nv-site';
```

③ `teardown()` 内 `clearVideoStages();` 之前追加两行，`applyTheme()` 内 `injectStyle(CLASSIC_STYLE_ID, ...)` 之后追加站点层块：

```js
function teardown() {
  removeStyle(CLASSIC_STYLE_ID);
  removeStyle(GUARD_STYLE_ID);
  removeStyle(SITE_STYLE_ID);
  if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }
  document.documentElement?.removeAttribute(SITE_ATTR);
  clearVideoStages();
}
```

```js
function applyTheme(settings) {
  armGuard(settings);
  injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));
  const site = matchSiteTheme(location.hostname);
  if (site && !(settings.disabledSiteThemes ?? []).includes(site.id)) {
    document.documentElement.setAttribute(SITE_ATTR, site.id);
    injectStyle(SITE_STYLE_ID, compileSiteTheme(site.id));
  }
  markMediaStages();
  // ...其余不变
```

- [ ] **Step 2: 单测 + 构建**

Run: `npm test && npm run build`
Expected: PASS（32 tests）+ 构建无报错

- [ ] **Step 3: tabbit 负向验证**

Run: `/tabbit`——Dark 状态下打开 `http://localhost:8123/plain.html`，断言 `document.documentElement.getAttribute('data-nv-site') === null` 且 `document.getElementById('nv-site') === null`（localhost 不匹配任何站点主题，classic 照常生效）。正向效果在 Task 12 真实站点验收。

- [ ] **Step 4: Commit**

```bash
git add src/content/main.js
git commit -m "feat: inject site refinement layer on matching hosts

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: 右键菜单 + per-site 工具栏（共享决策 + background）

**Files:**
- Create: `src/shared/actions.js`
- Create: `tests/unit/actions.test.mjs`
- Modify: `src/shared/strings.js`（扩 4 键）
- Modify: `src/background/main.js`（整文件替换）

**Interfaces:**
- Consumes: Task 2 `normalizeHostname/hostnameInList`
- Produces:
  - `export function hostnameFromUrl(url): string|null`
  - `export function menuClickPatch(settings, url): object|null`——加当前主机名进当前模式的列表；已在列表（后缀匹配）返回 `null`；URL 不可解析返回 `null`
  - `export function toolbarClickPatch(settings, url): object`——默认 `{ state: 翻转 }`；inclusionMode+perSiteToggle 且 URL 可用时返回 `{ inclusionList: 加/删 }`（删除时按 D4 规则）
  - STRINGS 新键：`menuExcludeSite: 'Exclude this site from NightVeil'`、`menuIncludeSite: 'Include this site in NightVeil'`、`stateTitleSiteOn: 'NightVeil — Site included'`、`stateTitleSiteOff: 'NightVeil — Site not included'`

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hostnameFromUrl, menuClickPatch, toolbarClickPatch } from '../../src/shared/actions.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

test('hostnameFromUrl normalizes and rejects junk', () => {
  assert.equal(hostnameFromUrl('https://www.Example.com/x'), 'example.com');
  assert.equal(hostnameFromUrl('not a url'), null);
  assert.equal(hostnameFromUrl(null), null);
});

test('menuClickPatch adds the seen host to the active mode list, idempotently', () => {
  const p = menuClickPatch({ ...DEFAULT_SETTINGS, state: 'dark' }, 'https://gist.github.com/u/r');
  assert.deepEqual(p, { exclusionList: ['gist.github.com'] });
  assert.equal(menuClickPatch({ ...DEFAULT_SETTINGS, exclusionList: ['github.com'] }, 'https://gist.github.com/u/r'), null);
  const inc = menuClickPatch({ ...DEFAULT_SETTINGS, inclusionMode: true }, 'https://www.reddit.com/');
  assert.deepEqual(inc, { inclusionList: ['reddit.com'] });
  assert.equal(menuClickPatch(DEFAULT_SETTINGS, 'junk'), null);
});

test('toolbarClickPatch toggles global state by default', () => {
  assert.deepEqual(toolbarClickPatch({ ...DEFAULT_SETTINGS, state: 'light' }, 'https://x.com/'), { state: 'dark' });
  assert.deepEqual(toolbarClickPatch({ ...DEFAULT_SETTINGS, state: 'dark' }, null), { state: 'light' });
});

test('toolbarClickPatch per-site mode adds, then removes governing entries', () => {
  const s = { ...DEFAULT_SETTINGS, state: 'dark', inclusionMode: true, perSiteToggle: true };
  assert.deepEqual(toolbarClickPatch(s, 'https://www.github.com/'), { inclusionList: ['github.com'] });
  const listed = { ...s, inclusionList: ['github.com'] };
  assert.deepEqual(toolbarClickPatch(listed, 'https://gist.github.com/'), { inclusionList: [] });
  const siblings = { ...s, inclusionList: ['github.com', 'gist.github.com'] };
  assert.deepEqual(toolbarClickPatch(siblings, 'https://github.com/'), { inclusionList: ['gist.github.com'] });
  assert.deepEqual(toolbarClickPatch(s, null), { state: 'light' }, 'no url → global fallback');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL——`Cannot find module '../../src/shared/actions.js'`

- [ ] **Step 3: 实现 actions.js + strings 扩键 + background 重写**

`src/shared/actions.js`：

```js
// src/shared/actions.js
// Pure decision helpers for background-initiated settings changes.
// Background wires chrome APIs around these; matching logic stays testable.
import { normalizeHostname, hostnameInList } from './scope.js';

export function hostnameFromUrl(url) {
  try { return normalizeHostname(new URL(url).hostname); } catch { return null; }
}

// Context-menu click: add the page's host to the active mode's list. Never
// removes — faithful to the original's missing un-exclude entry (BACKLOG).
export function menuClickPatch(settings, url) {
  const host = hostnameFromUrl(url);
  if (!host) return null;
  const key = settings.inclusionMode ? 'inclusionList' : 'exclusionList';
  const list = settings[key] ?? [];
  if (hostnameInList(host, list)) return null;
  return { [key]: [...list, host] };
}

// Toolbar click: global toggle; in inclusion mode + per-site toggle it flips
// the current host in the inclusion list instead. Removal drops the host and
// any parent entry governing it; sibling/child entries stay (D4).
export function toolbarClickPatch(settings, url) {
  if (!(settings.inclusionMode && settings.perSiteToggle)) {
    return { state: settings.state === 'dark' ? 'light' : 'dark' };
  }
  const host = hostnameFromUrl(url);
  if (!host) return { state: settings.state === 'dark' ? 'light' : 'dark' };
  const list = settings.inclusionList ?? [];
  if (!hostnameInList(host, list)) return { inclusionList: [...list, host] };
  const kept = list.filter((e) => {
    const ne = normalizeHostname(e);
    return !(host === ne || host.endsWith(`.${ne}`));
  });
  return { inclusionList: kept };
}
```

`src/shared/strings.js` 的 STRINGS 对象内追加 4 键：

```js
  menuExcludeSite: 'Exclude this site from NightVeil',
  menuIncludeSite: 'Include this site in NightVeil',
  stateTitleSiteOn: 'NightVeil — Site included',
  stateTitleSiteOff: 'NightVeil — Site not included',
```

`src/background/main.js` 整文件替换：

```js
// src/background/main.js
// Global state owner: toolbar toggle + icon/title sync, the site-list context
// menu, and per-site toolbar behavior in inclusion mode. State lives in
// chrome.storage.local (single object); content scripts re-render themselves.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, saveSettings, subscribeSettings } from '../shared/settings.js';
import { iconPathsFor } from '../shared/icons.js';
import { hostnameFromUrl, menuClickPatch, toolbarClickPatch } from '../shared/actions.js';
import { hostnameInList } from '../shared/scope.js';

const MENU_ID = 'nv-site-list';

console.debug(STRINGS.swStartedDebug);

function refreshToolbar(settings) {
  const dark = settings.state === 'dark';
  chrome.action.setIcon({ path: iconPathsFor(settings.state) });
  chrome.action.setTitle({ title: dark ? STRINGS.stateTitleDark : STRINGS.stateTitleLight });
}

let menuTitle = '';
function refreshMenu(settings) {
  const title = settings.inclusionMode ? STRINGS.menuIncludeSite : STRINGS.menuExcludeSite;
  if (title === menuTitle) return;
  menuTitle = title;
  // recreate (not update) so the menu also exists on a fresh service worker
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title, contexts: ['page'] });
  });
}

chrome.runtime.onInstalled.addListener(() => { loadSettings().then(refreshMenu); });
chrome.runtime.onStartup.addListener(() => { loadSettings().then(refreshMenu); });

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const patch = menuClickPatch(await loadSettings(), tab?.url);
  if (patch) await saveSettings(patch);
});

chrome.action.onClicked.addListener(async (tab) => {
  const before = await loadSettings();
  await saveSettings(toolbarClickPatch(before, tab?.url));
  if (before.inclusionMode && before.perSiteToggle && tab?.id && tab.url) {
    // per-tab title feedback; v1: no navigation-follow updates (backlog)
    const now = await loadSettings();
    const on = hostnameInList(hostnameFromUrl(tab.url), now.inclusionList);
    chrome.action.setTitle({ tabId: tab.id, title: on ? STRINGS.stateTitleSiteOn : STRINGS.stateTitleSiteOff });
  }
});

loadSettings().then(refreshToolbar);
chrome.runtime.onStartup.addListener(() => {
  loadSettings().then(refreshToolbar);
});
subscribeSettings((s) => { refreshToolbar(s); refreshMenu(s); });
```

- [ ] **Step 4: 运行确认通过 + 构建**

Run: `npm test && npm run build`
Expected: PASS（32 + 4 = 36 tests）+ 构建无报错

- [ ] **Step 5: 用户人工冒烟（右键菜单无法被 tabbit 驱动）**

用户重载扩展后：在 `http://localhost:8123/plain.html` 右键 → 出现 "Exclude this site from NightVeil" → 点击 → 页面立即变回浅色（storage 广播触发 teardown）；刷新后仍为浅色；进入 Task 10/11 的选项页（或 DevTools `chrome.storage.local`）删除 `localhost` 条目后恢复。SW console 无新报错。

- [ ] **Step 6: Commit**

```bash
git add src/shared/actions.js tests/unit/actions.test.mjs src/shared/strings.js src/background/main.js
git commit -m "feat: exclude/include context menu and per-site toolbar toggle

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: options 页七分区框架 + I 区（主题）+ 自动保存 + Reset

**Files:**
- Modify: `public/options.html`（整文件替换）
- Modify: `src/options/main.js`（整文件替换）
- Modify: `src/shared/strings.js`（扩 18 键）

**Interfaces:**
- Consumes: Task 1 settings v2、Task 7 `SITE_THEMES`、既有 `PALETTES`
- Produces:
  - 七个 `<details>` 分区容器（id：`sec-themes/sec-options/sec-usercss/sec-engine/sec-exclusion/sec-inclusion/sec-schedule`），I 区完整可用，III/IV/VII 渲染占位说明，II/V/VI 留待 Task 11 填充
  - 自动保存：控件 `change` → `saveSettings(patch)`；`subscribeSettings` 反向同步控件状态（不打断正在编辑的控件）
  - Reset：`saveSettings({ ...DEFAULT_SETTINGS })`
  - 预览态（D8）：`defaultStorage()` 抛错时按默认值渲染、`main[data-preview]` 禁交互、note 显示预览提示
  - STRINGS 新键（18）：
    ```js
    optionsNote: 'Changes save automatically.',   // 值更新（原 'Settings arrive in Milestone 1.' 删除）
    optionsPreviewNote: 'Preview — extension storage is unavailable here, so controls are disabled.',
    optionsSaveError: '[NightVeil] failed to save settings:',
    resetButton: 'Reset to defaults',
    sectionThemesLabel: 'Themes',
    classicThemeLabel: 'Classic theme',
    overlayFamilyLabel: 'Overlay family — colors painted over the page',
    invertFamilyLabel: 'Invert family — filter inversion with media protection',
    siteThemesLabel: 'Site themes',
    siteThemesNote: 'Refinements applied on top of the classic theme for specific sites.',
    sectionOptionsLabel: 'Options',
    sectionUserCssLabel: 'User CSS',
    sectionUserCssNote: 'Write your own dark styles in a later milestone.',
    sectionEngineLabel: 'Adaptive engine',
    sectionEngineNote: 'Live color rewriting arrives in a later milestone.',
    sectionExclusionLabel: 'Exclusion',
    sectionInclusionLabel: 'Inclusion',
    sectionScheduleLabel: 'Schedule',
    sectionScheduleNote: 'Automatic daily on/off arrives in a later milestone.',
    ```

- [ ] **Step 1: 替换 public/options.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>NightVeil</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 720px; padding: 16px; color: #1a1a1a; }
      main > * + * { margin-top: 12px; }
      details { border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 12px; }
      summary { font-weight: 600; cursor: pointer; }
      fieldset { border: 1px solid #e4e7eb; border-radius: 6px; margin: 8px 0; }
      label { display: block; margin: 2px 0; }
      .hint { color: #57606a; font-size: 90%; }
      .cols { columns: 2; }
      textarea { width: 100%; min-height: 96px; box-sizing: border-box; }
      #reset { float: right; }
      main[data-preview] { opacity: 0.7; pointer-events: none; }
    </style>
  </head>
  <body>
    <main>
      <h1 id="heading"></h1>
      <p id="note" class="hint"></p>
      <button id="reset"></button>
      <details id="sec-themes" open></details>
      <details id="sec-options"></details>
      <details id="sec-usercss"></details>
      <details id="sec-engine"></details>
      <details id="sec-exclusion"></details>
      <details id="sec-inclusion"></details>
      <details id="sec-schedule"></details>
    </main>
    <script src="options.js"></script>
  </body>
</html>
```

（`<title>NightVeil</title>` 逐字保留——strings-source 测试锁定。）

- [ ] **Step 2: 替换 src/options/main.js**

```js
// src/options/main.js
// Seven-section options page (I themes / II options / III user-css / IV
// engine / V exclusion / VI inclusion / VII schedule). All copy comes from
// shared/strings.js; control data from palettes/siteThemes. Edits autosave
// via saveSettings; storage.onChanged keeps open pages in sync. When
// chrome.storage is unavailable (http fixture mount) the page renders a
// disabled preview from defaults so rendering stays verifiable.
import { STRINGS } from '../shared/strings.js';
import {
  DEFAULT_SETTINGS, defaultStorage, loadSettings, saveSettings, subscribeSettings,
} from '../shared/settings.js';
import { PALETTES } from '../shared/palettes.js';
import { SITE_THEMES } from '../shared/siteThemes.js';

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'checked' || k === 'disabled') { if (v) node[k] = true; }
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function section(id, summaryText, ...body) {
  $(`#${id}`).append(el('summary', {}, summaryText), ...body);
}

function note(text) { return el('p', { class: 'hint' }, text); }

function storageAvailable() {
  try { defaultStorage(); return true; } catch { return false; }
}

let writable = false;
let current = { ...DEFAULT_SETTINGS };

function save(patch) {
  if (writable) saveSettings(patch).catch((e) => console.error(STRINGS.optionsSaveError, e));
}

// ---- Section I: themes ----
function renderThemes() {
  const families = [
    [STRINGS.overlayFamilyLabel, PALETTES.filter((p) => p.family === 'overlay')],
    [STRINGS.invertFamilyLabel, PALETTES.filter((p) => p.family === 'invert')],
  ];
  const classic = el('fieldset', {}, el('legend', {}, STRINGS.classicThemeLabel));
  for (const [label, palettes] of families) {
    const group = el('div', { class: 'cols' });
    for (const p of palettes) {
      group.append(el('label', {},
        el('input', { type: 'radio', name: 'themeId', value: p.id, checked: current.themeId === p.id }),
        ` ${p.label}`));
    }
    classic.append(el('p', { class: 'hint' }, label), group);
  }
  classic.addEventListener('change', (e) => {
    if (e.target.name === 'themeId') save({ themeId: e.target.value });
  });

  const sites = el('fieldset', {}, el('legend', {}, STRINGS.siteThemesLabel));
  const siteBox = el('div', { class: 'cols' });
  for (const t of SITE_THEMES) {
    siteBox.append(el('label', {},
      el('input', { type: 'checkbox', 'data-site': t.id, checked: !(current.disabledSiteThemes ?? []).includes(t.id) }),
      ` ${t.label}`));
  }
  sites.append(siteBox, note(STRINGS.siteThemesNote));
  sites.addEventListener('change', (e) => {
    if (!e.target.getAttribute('data-site')) return;
    const disabled = [...sites.querySelectorAll('input[data-site]')]
      .filter((i) => !i.checked)
      .map((i) => i.getAttribute('data-site'));
    save({ disabledSiteThemes: disabled });
  });

  section('sec-themes', STRINGS.sectionThemesLabel, classic, sites);
}

// ---- Placeholder sections (III / IV / VII) ----
function renderPlaceholders() {
  section('sec-usercss', STRINGS.sectionUserCssLabel, note(STRINGS.sectionUserCssNote));
  section('sec-engine', STRINGS.sectionEngineLabel, note(STRINGS.sectionEngineNote));
  section('sec-schedule', STRINGS.sectionScheduleLabel, note(STRINGS.sectionScheduleNote));
}

// ---- Reset ----
function wireReset() {
  const btn = $('#reset');
  btn.textContent = STRINGS.resetButton;
  btn.addEventListener('click', () => save({ ...DEFAULT_SETTINGS }));
}

// ---- storage-driven sync (external changes while the page stays open) ----
function syncFromSettings(s) {
  current = s;
  const radio = document.querySelector(`#sec-themes input[name="themeId"][value="${s.themeId}"]`);
  if (radio) radio.checked = true;
  for (const i of document.querySelectorAll('#sec-themes input[data-site]')) {
    i.checked = !(s.disabledSiteThemes ?? []).includes(i.getAttribute('data-site'));
  }
}

function renderAll() {
  renderThemes();
  renderPlaceholders();
  // Sections II / V / VI land in the next task.
}

function render() {
  $('#heading').textContent = STRINGS.optionsHeading;
  $('#note').textContent = STRINGS.optionsNote;
  wireReset();
  if (storageAvailable()) {
    writable = true;
    loadSettings()
      .then((s) => { current = s; renderAll(); subscribeSettings(syncFromSettings); })
      .catch((e) => console.error(STRINGS.optionsSaveError, e));
  } else {
    current = { ...DEFAULT_SETTINGS };
    renderAll();
    document.querySelector('main').setAttribute('data-preview', '');
    $('#note').textContent = STRINGS.optionsPreviewNote;
  }
}

render();
```

- [ ] **Step 3: 扩 strings.js**

在 STRINGS 对象中追加 Task 10 的 18 键（`optionsNote` 用新值替换旧值，其余既有键不动），并同步 `src/options/main.js` 顶部注释里对 optionsNote 的依赖（无——文案引用均为键名，无需其他改动）。

- [ ] **Step 4: 单测 + 构建**

Run: `npm test && npm run build`
Expected: PASS（36 tests，含 strings-source：`<title>NightVeil</title>` 逐字保留所以不破）

- [ ] **Step 5: http 挂载验证（预览态，D8）**

```bash
npm run build
cp extension/options.html extension/options.js tests/fixtures/
# 起服务后 /tabbit 打开 http://localhost:8123/options.html，断言：
#   - 7 个 details 分区、summary 文案来自 STRINGS
#   - input[name=themeId] 共 40 个（26 overlay + 14 invert），默认选中 Evening
#   - input[data-site] 共 10 个且全选中
#   - Reset 按钮文案正确；页面显示预览提示（storage 不可用）
#   - console 无未捕获异常
rm tests/fixtures/options.html tests/fixtures/options.js
```

- [ ] **Step 6: 真实选项页行为验证（用户配合）**

用户打开 `chrome://extensions` → NightVeil → 扩展选项：选一个非默认 Classic Theme（如 Midnight）→ 另开 `http://localhost:8123/plain.html` 已打开的标签页**无需刷新**变为新主题（storage 广播）；关掉一个 Site Theme 开关无报错；点 Reset 后主题回到 Evening 且 plain.html 跟随。

- [ ] **Step 7: Commit**

```bash
git add public/options.html src/options/main.js src/shared/strings.js
git commit -m "feat: options page framework with themes section, autosave, and reset

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: options II/V/VI 区（行为开关 + 排除规则 + 列表编辑）

**Files:**
- Modify: `src/options/main.js`（插入三个渲染函数 + 接线）
- Modify: `src/shared/strings.js`（扩 16 键）

**Interfaces:**
- Consumes: Task 1 settings v2 全部字段
- Produces:
  - II 区：Global State 单选（light/dark）、Inclusion Mode / Per-site Toggle 复选、Exclusion Rules 表单（metaScheme/darkBackground 复选、brightnessThreshold 数字 0-255、htmlAttributes/htmlClasses/cookies 文本）
  - V/VI 区：`exclusionList` / `inclusionList` 的 textarea（每行一个主机名，change 时去重保存）
  - `syncFromSettings` 扩展为同步上述全部控件（正在聚焦的 textarea 跳过）
  - STRINGS 新键（16）：
    ```js
    behaviorLabel: 'Behavior',
    stateLightLabel: 'Light',
    stateDarkLabel: 'Dark',
    inclusionModeLabel: 'Inclusion mode — dark applies only to the inclusion list',
    inclusionModeNote: 'The exclusion list is ignored while this is on.',
    perSiteToggleLabel: 'Per-site toolbar toggle (inclusion mode only) — the toolbar button adds or removes the current site',
    rulesLabel: 'Exclusion rules',
    ruleMetaSchemeLabel: 'Skip pages that declare a dark color-scheme',
    ruleDarkBackgroundLabel: 'Skip pages whose background is already dark',
    ruleBrightnessLabel: 'Dark background threshold (0-255):',
    ruleHtmlAttributesLabel: 'HTML attributes (name or name=value, comma-separated):',
    ruleHtmlClassesLabel: 'HTML classes (comma-separated):',
    ruleCookiesLabel: 'Cookie names (comma-separated):',
    listEditHint: 'One hostname per line. "www." is ignored; an entry also covers its subdomains.',
    exclusionListLabel: 'Exclusion list',
    inclusionListLabel: 'Inclusion list',
    ```

- [ ] **Step 1: 插入渲染函数（`renderPlaceholders` 之后）**

```js
// ---- Section II: options (behavior + exclusion rules) ----
function renderBehavior() {
  const box = el('fieldset', {}, el('legend', {}, STRINGS.behaviorLabel));
  box.append(
    el('label', {}, el('input', { type: 'radio', name: 'state', value: 'light', checked: current.state === 'light' }), ` ${STRINGS.stateLightLabel}`),
    el('label', {}, el('input', { type: 'radio', name: 'state', value: 'dark', checked: current.state === 'dark' }), ` ${STRINGS.stateDarkLabel}`),
    el('label', {}, el('input', { type: 'checkbox', 'data-key': 'inclusionMode', checked: current.inclusionMode }), ` ${STRINGS.inclusionModeLabel}`),
    note(STRINGS.inclusionModeNote),
    el('label', {}, el('input', { type: 'checkbox', 'data-key': 'perSiteToggle', checked: current.perSiteToggle }), ` ${STRINGS.perSiteToggleLabel}`),
  );
  box.addEventListener('change', (e) => {
    if (e.target.name === 'state') save({ state: e.target.value });
    else if (e.target.getAttribute('data-key')) save({ [e.target.getAttribute('data-key')]: e.target.checked });
  });

  const r = current.exclusionRules ?? {};
  const rules = el('fieldset', {}, el('legend', {}, STRINGS.rulesLabel));
  rules.append(
    el('label', {}, el('input', { type: 'checkbox', 'data-rule': 'metaScheme', checked: r.metaScheme }), ` ${STRINGS.ruleMetaSchemeLabel}`),
    el('label', {}, el('input', { type: 'checkbox', 'data-rule': 'darkBackground', checked: r.darkBackground }), ` ${STRINGS.ruleDarkBackgroundLabel}`),
    el('label', {}, `${STRINGS.ruleBrightnessLabel} `, el('input', { type: 'number', min: '0', max: '255', 'data-rule': 'brightnessThreshold', value: r.brightnessThreshold ?? 50 })),
    el('label', {}, `${STRINGS.ruleHtmlAttributesLabel} `, el('input', { type: 'text', size: '40', 'data-rule': 'htmlAttributes', value: r.htmlAttributes ?? '' })),
    el('label', {}, `${STRINGS.ruleHtmlClassesLabel} `, el('input', { type: 'text', size: '40', 'data-rule': 'htmlClasses', value: r.htmlClasses ?? '' })),
    el('label', {}, `${STRINGS.ruleCookiesLabel} `, el('input', { type: 'text', size: '40', 'data-rule': 'cookies', value: r.cookies ?? '' })),
  );
  rules.addEventListener('change', (e) => {
    const key = e.target.getAttribute('data-rule');
    if (!key) return;
    const val = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'number' ? Math.max(0, Math.min(255, Number(e.target.value) || 0))
        : e.target.value;
    save({ exclusionRules: { ...(current.exclusionRules ?? {}), [key]: val } });
  });

  section('sec-options', STRINGS.sectionOptionsLabel, box, rules);
}

// ---- Sections V / VI: hostname lists ----
function renderListSection(id, summary, key, labelText) {
  const ta = el('textarea', { 'data-list': key }, (current[key] ?? []).join('\n'));
  const box = el('div', {}, el('p', { class: 'hint' }, labelText), ta, note(STRINGS.listEditHint));
  ta.addEventListener('change', () => {
    const list = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
    save({ [key]: [...new Set(list)] });
  });
  section(id, summary, box);
}
```

- [ ] **Step 2: 接线**

`renderAll()` 替换为：

```js
function renderAll() {
  renderThemes();
  renderBehavior();
  renderListSection('sec-exclusion', STRINGS.sectionExclusionLabel, 'exclusionList', STRINGS.exclusionListLabel);
  renderListSection('sec-inclusion', STRINGS.sectionInclusionLabel, 'inclusionList', STRINGS.inclusionListLabel);
  renderPlaceholders();
}
```

`syncFromSettings(s)` 在既有主题同步之后追加：

```js
  const stateRadio = document.querySelector(`#sec-options input[name="state"][value="${s.state}"]`);
  if (stateRadio) stateRadio.checked = true;
  for (const i of document.querySelectorAll('#sec-options input[data-key]')) {
    i.checked = !!s[i.getAttribute('data-key')];
  }
  const r = s.exclusionRules ?? {};
  for (const i of document.querySelectorAll('#sec-options [data-rule]')) {
    const key = i.getAttribute('data-rule');
    if (i.type === 'checkbox') i.checked = !!r[key];
    else if (document.activeElement !== i) i.value = r[key] ?? '';
  }
  for (const ta of document.querySelectorAll('textarea[data-list]')) {
    if (document.activeElement !== ta) ta.value = (s[ta.getAttribute('data-list')] ?? []).join('\n');
  }
```

- [ ] **Step 3: 扩 strings.js（16 键如 Interfaces 所列）**

- [ ] **Step 4: 单测 + 构建**

Run: `npm test && npm run build`
Expected: PASS（36 tests）+ 构建无报错

- [ ] **Step 5: http 挂载验证（预览态）**

同 Task 10 Step 5 的拷贝/删除流程，断言：II 区控件齐全且默认值正确（Light、两个开关未选、metaScheme 勾选、阈值 50、属性/类预填默认串）；V/VI textarea 为空；7 区 summary 文案齐全；console 无异常。

- [ ] **Step 6: 真实选项页端到端（用户配合，验证里程碑条目 7）**

1. 用户在真实选项页把 `localhost` 填入 Exclusion list → 已打开的 plain.html 立即变浅色；删除该行 → 恢复暗色
2. 勾选 Inclusion mode → plain.html 变浅（localhost 不在列表）；把 `localhost` 填入 Inclusion list → 恢复暗色
3. 勾选 Per-site toggle + Inclusion mode → 工具栏点击 plain.html 标签页 → 页面切浅且按钮标题变 "NightVeil — Site not included"；再点 → 恢复暗色且标题变 "…Site included"
4. Reset → 全部回到默认（Light、无列表、Evening）

- [ ] **Step 7: Commit**

```bash
git add src/options/main.js src/shared/strings.js
git commit -m "feat: options sections for behavior toggles, exclusion rules, and site lists

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: M1b 验收轮 + 里程碑更新

**Files:**
- Modify: `docs/MILESTONES.md`
- 可能 Modify: `src/shared/siteThemes.js`（真实站点抽查后调优选择器，允许提交修正）

**Interfaces:**
- Consumes: Task 1-11 全部产物
- Produces: 验收证据 + MILESTONES.md 勾选

- [ ] **Step 1: 全量回归**

Run: `npm test && npm run build`
Expected: 36/36 通过、构建无报错（自主迭代.md 通用条目 4）

- [ ] **Step 2: tabbit 逐条验收（通用条目 1-4 + 里程碑条目 5-8）**

fixtures 服务 + /tabbit，用户配合重载扩展与工具栏操作：

| # | 条目 | 断言 |
|---|---|---|
| 1 | 通用 1-3 | 用户确认扩展卡片无 Errors；各 fixture 页 console 无未捕获异常 |
| 2 | 条目 5 | plain.html 工具栏切换 Light/Dark，图标标题跟随（dark 即时生效不刷新） |
| 3 | 条目 6 | 选项页选 Midnight → plain.html 即时换主题；刷新后仍生效；换 Evening 即时替换 |
| 4 | 条目 6+ | **invert 家族运行时断言（M1a 遗留）**：选项页选 Invert Balanced → plain.html 断言 `getComputedStyle(document.documentElement).filter` 含 `invert(100%)`，且 img 正常（保护名单生效——vars.html 有无图元素可看 media.html 封面不变色） |
| 5 | 条目 7 | Task 11 Step 6 的端到端结果作为证据（Exclusion List + Inclusion Mode） |
| 6 | 条目 8 | Task 10/11 Step 5-6 的结果作为证据（分区展开/自动保存/Reset） |
| 7 | 规则 | native-dark.html 在 Dark 状态下不被着色（Task 5 Step 3 已验，复跑一次） |
| 8 | 浏览器重启图标同步（M1a 遗留） | 用户完全退出并重启 Chrome → 工具栏图标仍与重启前状态一致（扩展重载 ≠ 浏览器重启） |

- [ ] **Step 3: 真实站点抽查（M1 收尾要求 + 站点主题 v1 调优）**

用户配合，Dark 状态逐站截图检查：github.com、wikipedia.org、stackoverflow.com（M1 指定三站）。每站断言：暗色生效、`document.documentElement.getAttribute('data-nv-site')` 等于对应站点 id、`#nv-site` 存在。选择器未命中/效果不佳的允许当场修 `siteThemes.js` 并提交（`fix: tune <site> site theme selectors`），修完复验。

- [ ] **Step 4: 四页冒烟基线（2026-09-11/12 灰度回归，M1b 计划吸收项）**

用户配合目视检查（本轮灰度覆盖页转为回归基线）：
1. bilibili 首页——不全黑、内容可见（wave 9 回归）
2. bilibili 空间列表——数据条仍为渐变（wave 1-3 回归）
3. bilibili 播放页小窗——无黑屏（wave 1-3 回归）
4. 新浪行情页——标题/删除按钮文字可见（wave 7-8 回归）

任一失败按自主迭代协议循环修复（连续 3 次失败终止上报）。

- [ ] **Step 5: 更新 docs/MILESTONES.md**

- 总览表：M1b 状态 ⬜→✅，验收轮次填本轮结论；总览最新更新日期改当日
- M1 功能清单：勾选全部 🅱 条目（右键菜单、Site Theme 10 个、Exclusion List/Rules、Inclusion Mode + Per-site Toggle、options 七分区、5 张 fixture、路径遍历断言；"40 个 Classic Theme"整条勾选——选项页单选 UI 已交付）
- 追加记录：新增一行日期条目，记录 M1b 验收证据摘要（tabbit 断言项、真实站点抽查、四页冒烟、invert 运行时断言、重启图标同步）

- [ ] **Step 6: Commit**

```bash
git add docs/MILESTONES.md src/shared/siteThemes.js
git commit -m "docs: M1b acceptance evidence and milestone update

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

（siteThemes.js 仅在 Step 3 实际调优时加入。）

---

## 自查记录（Self-Review）

- **规格覆盖**：MILESTONES 🅱 条目 → 右键菜单（T9）、40 主题选项 UI（T10）、10 Site Theme（T7/T8）、Exclusion List/Rules（T1/T2/T3/T5/T11）、Inclusion Mode + Per-site Toggle（T1/T9/T11）、options 七分区 + 自动保存 + Reset（T10/T11）、5 张 fixture（T4/T6）、路径遍历（T6）；M1a 遗留四项（invert 运行时断言/重启图标/guard 取色/多写者）分别落 T12/T12/T1/T1；四页冒烟落 T12。自主迭代.md 条目 5-8 由 T12 Step 2 覆盖。
- **占位符扫描**：无 TBD/TODO；siteThemes 选择器标注 "v1 初稿，验收轮调优" 是有意的规格决策（D1 注记），非占位。
- **类型一致性**：settings 字段名在 T1 定义后全计划一致（inclusionMode/perSiteToggle/exclusionList/inclusionList/disabledSiteThemes/exclusionRules.{metaScheme,darkBackground,brightnessThreshold,htmlAttributes,htmlClasses,cookies}）；signals 形状 `{metaSchemeDark, htmlAttrs, htmlClasses, cookieNames, bgLuminance}` 在 T3 定义、T5 消费一致；`guardBackgroundFor/matchSiteTheme/compileSiteTheme/menuClickPatch/toolbarClickPatch` 签名前后一致。
- **测试基线演进**：16 → 20（T1）→ 23（T2）→ 29（T3）→ 29（T4 改断言不加数）→ 29（T5 不加）→ 29（T6 断言加在既有 test 内）→ 32（T7）→ 32（T8）→ 36（T9）→ 36（T10/T11 不加）。
