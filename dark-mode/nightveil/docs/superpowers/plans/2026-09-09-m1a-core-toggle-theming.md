# NightVeil M1a（核心切换与主题引擎）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 NightVeil 真正可用——工具栏一键切换 Light/Dark（状态持久化、图标标题同步），content script 按状态注入 40 个参数化主题之一，含防白闪基础版与文案单源断言。

**Architecture:** 三端共享 `src/shared/`（settings 存储层 / palettes 数据 / themes 编译器 / icons 路径映射 / strings 文案），content script 直读 `chrome.storage.local` 并订阅 `storage.onChanged` 重渲染（无请求-响应消息，状态变更即广播），service worker 只负责 action 点击切换与工具栏图标/标题。主题 = 调色板参数 + 两套家族模板（Overlay 覆盖式 / Invert 反色式）在 content 端编译为 CSS 字符串，以带 id 的 `<style>` 注入。

**Tech Stack:** 既有 M0 底座（Node ≥20、esbuild、node:test、/tabbit 验收），无新依赖。

## Global Constraints

- 工作目录：`/Users/zero/Project/chromeStore/dark-mode/nightveil`（git 根 `/Users/zero/Project/chromeStore`，分支 `develop` 直接提交）
- **防拷贝红线（ADR-0003）**：不打开原版插件源码参照；存储键、标识符、选择器集、文案、色值全部原创；`--nv-*` 前缀保留给 M2 自适应引擎，本计划不使用
- **存储 schema（ADR-0003 第 4 层）**：单一对象，键名 `nightveil.settings`，M1a 字段恰为 `{ state: 'light'|'dark', themeId: string }`，默认 `{ state: 'light', themeId: 'nv-simple' }`
- **主题数量对等（ADR-0002）**：40 项 = 26 Overlay + 14 Invert；色值/命名原创，不模仿原版任何具体主题
- **文案单源**：`src/` 运行时文案只能来自 `src/shared/strings.js`；静态文件（manifest/options.html）文案以 `tests/unit/strings-source.test.mjs` 断言与 STRINGS 一致（`extensionName`、`extensionDescription` 双向锁定）
- 现有测试（icons/build/server ×4）必须保持绿；`npm test` = `node --test`
- `extension/` 是构建产物不手改；改 `src/`/`public/` 后必须 `npm run build` 才验收
- manifest 权限集 M1a 不变（storage/contextMenus 已够用；contextMenus 的使用在 M1b）
- 提交信息 conventional commits + `Co-Authored-By: Claude Code <noreply@anthropic.com>` 尾注
- tabbit 已知限制（见 自主迭代.md）：`chrome://`、`chrome-extension://`、`file://` 均被拦；扩展重载与工具栏点击需用户人工配合

## 文件结构（本计划涉及）

```
src/
  shared/
    strings.js        # 文案（扩键：extensionDescription/stateTitleDark/stateTitleLight）
    settings.js       # 存储层：load/save/subscribe + DEFAULT_SETTINGS + STORAGE_KEY（storage 适配器可注入）
    palettes.js       # 40 组调色板数据 + findPalette(id)
    themes.js         # compileTheme(palette)：Overlay/Invert 两套模板编译为 CSS 字符串
    icons.js          # iconPathsFor(state)：工具栏图标路径映射（纯函数）
  background/main.js  # 重写：action 点击切换 + 图标/标题同步 + 订阅状态
  content/main.js     # 重写：读设置→注入/移除主题 + Flash Guard + 订阅重渲染
public/               # （无改动——M0 的 manifest/options.html 原样）
tests/
  fixtures/plain.html # M1a 验收页（新增）
  unit/
    settings.test.mjs       # 新增
    strings-source.test.mjs # 新增（单源断言）
    palettes.test.mjs       # 新增
    themes.test.mjs         # 新增
```

---

### Task 1: 存储层 + 文案单源（TDD）

**Files:**
- Modify: `src/shared/strings.js`（扩 3 个键）
- Create: `src/shared/settings.js`
- Create: `tests/unit/settings.test.mjs`
- Create: `tests/unit/strings-source.test.mjs`

**Interfaces:**
- Consumes: 无（M0 既有 strings.js 结构）
- Produces（后续任务依赖的精确签名）:
  - `settings.js`: `export const STORAGE_KEY = 'nightveil.settings'`；`export const DEFAULT_SETTINGS = { state: 'light', themeId: 'nv-simple' }`；`export async function loadSettings(storage = defaultStorage()): Promise<Settings>`（读不到/缺字段时补默认）；`export async function saveSettings(patch, storage = defaultStorage()): Promise<Settings>`（浅合并一层后写入并返回合并结果）；`export function subscribeSettings(callback, storage = defaultStorage())`（callback 收 `Settings`，返回取消订阅函数）
  - `strings.js` 新增键：`extensionDescription: 'A global dark theme for the web.'`、`stateTitleDark: 'NightVeil — Dark'`、`stateTitleLight: 'NightVeil — Light'`（现有 5 键不动）

- [ ] **Step 1: 写 settings 失败测试**

```js
// tests/unit/settings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, DEFAULT_SETTINGS, loadSettings, saveSettings, subscribeSettings } from '../../src/shared/settings.js';

// chrome.storage.local 形状的内存适配器
class MemoryStorage {
  constructor(initial = {}) { this.data = {...initial}; this.listeners = new Set(); }
  get(keys, cb) {
    const want = typeof keys === 'string' ? [keys] : keys;
    const out = {};
    for (const k of want) if (k in this.data) out[k] = this.data[k];
    cb(out);
  }
  set(obj, cb) {
    Object.assign(this.data, obj);
    const changes = {};
    for (const k of Object.keys(obj)) changes[k] = { newValue: obj[k] };
    for (const l of this.listeners) l(changes, 'local');
    cb();
  }
  get onChanged() {
    return { addListener: (l) => this.listeners.add(l), removeListener: (l) => this.listeners.delete(l) };
  }
}

test('loadSettings returns defaults for missing key and fills missing fields', async () => {
  const mem = new MemoryStorage();
  assert.deepEqual(await loadSettings(mem), DEFAULT_SETTINGS);
  const partial = new MemoryStorage({ [STORAGE_KEY]: { themeId: 'nv-midnight' } });
  assert.deepEqual(await loadSettings(partial), { state: 'light', themeId: 'nv-midnight' });
});

test('saveSettings shallow-merges patch, persists, and returns merged settings', async () => {
  const mem = new MemoryStorage();
  const after = await saveSettings({ state: 'dark' }, mem);
  assert.equal(after.state, 'dark');
  assert.equal(after.themeId, DEFAULT_SETTINGS.themeId);
  const reread = await loadSettings(mem);
  assert.deepEqual(reread, after);
});

test('subscribeSettings fires with new settings on our key only and can be cancelled', async () => {
  const mem = new MemoryStorage();
  const seen = [];
  const off = subscribeSettings((s) => seen.push(s), mem);
  await saveSettings({ state: 'dark' }, mem);
  mem.set({ 'someone.else': 1 }, () => {});
  off();
  await saveSettings({ state: 'light' }, mem);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].state, 'dark');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/settings.test.mjs`
Expected: FAIL — Cannot find module `../../src/shared/settings.js`

- [ ] **Step 3: 实现 settings.js**

```js
// src/shared/settings.js
// Single-object settings store. All extension contexts read/write this shape;
// no request-response messaging is used for state — storage.onChanged is the bus.
const STORAGE_KEY_VALUE = 'nightveil.settings';

export const STORAGE_KEY = STORAGE_KEY_VALUE;

export const DEFAULT_SETTINGS = Object.freeze({
  state: 'light',       // 'light' | 'dark'
  themeId: 'nv-simple', // palettes.js id
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

export async function saveSettings(patch, storage = defaultStorage()) {
  const merged = mergeWithDefaults({ ...(await loadSettings(storage)), ...patch });
  return await new Promise((resolve) => {
    storage.set({ [STORAGE_KEY_VALUE]: merged }, () => resolve(merged));
  });
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

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/settings.test.mjs`
Expected: 3 pass

- [ ] **Step 5: 写文案单源失败测试**

```js
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
```

- [ ] **Step 6: 运行确认失败**

Run: `node --test tests/unit/strings-source.test.mjs`
Expected: FAIL — `STRINGS.extensionDescription` is undefined（manifest.description 已是 'A global dark theme for the web.'，strings 尚无此键）

- [ ] **Step 7: 扩 strings.js（全量替换为）**

```js
// src/shared/strings.js
// All runtime user-visible English copy lives here (i18n-ready per ADR-0003).
// Static files (manifest.json, options.html) duplicate two values; the
// strings-source test keeps them locked to this module.
export const STRINGS = Object.freeze({
  extensionName: 'NightVeil',
  extensionDescription: 'A global dark theme for the web.',
  swStartedDebug: '[NightVeil] service worker started',
  contentActiveLog: '[NightVeil] content script active',
  optionsHeading: 'NightVeil Options',
  optionsNote: 'Settings arrive in Milestone 1.',
  stateTitleDark: 'NightVeil — Dark',
  stateTitleLight: 'NightVeil — Light',
});
```

- [ ] **Step 8: 运行两个测试文件确认通过**

Run: `node --test tests/unit/settings.test.mjs tests/unit/strings-source.test.mjs`
Expected: 4 pass

- [ ] **Step 9: 全量回归 + 提交**

Run: `npm test` → Expected: 8 pass, 0 fail（原 4 测试 + 新 4 测试：settings 3 + strings-source 1）

```bash
git add src/shared/settings.js src/shared/strings.js tests/unit/settings.test.mjs tests/unit/strings-source.test.mjs
git commit -m "feat: settings store with injectable storage adapter, single-source copy lock

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 调色板数据（26 Overlay + 14 Invert）（TDD）

**Files:**
- Create: `src/shared/palettes.js`
- Create: `tests/unit/palettes.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export const PALETTES`：40 项数组，每项 Overlay 为 `{ id, family: 'overlay', label, colors: { bg, surface, fg, muted, link, visited, cite, inputBg, border } }`（9 个 `#rrggbb`），Invert 为 `{ id, family: 'invert', label, params: { brightness, contrast, grayscale } }`（0–200 的数）
  - `export function findPalette(id): object`（命中返回该项，未命中返回 id 为 `'nv-simple'` 的项）

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/palettes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, findPalette } from '../../src/shared/palettes.js';

const HEX = /^#[0-9a-f]{6}$/;

test('palette set is exactly 40: 26 overlay + 14 invert, unique ids', () => {
  assert.equal(PALETTES.length, 40);
  const byFamily = { overlay: 0, invert: 0 };
  const ids = new Set();
  for (const p of PALETTES) {
    byFamily[p.family] += 1;
    ids.add(p.id);
    assert.ok(p.id.startsWith('nv-'), `bad id ${p.id}`);
    assert.ok(p.label.length > 0, `empty label for ${p.id}`);
  }
  assert.equal(byFamily.overlay, 26);
  assert.equal(byFamily.invert, 14);
  assert.equal(ids.size, 40);
});

test('overlay palettes carry 9 valid hex colors; invert palettes carry numeric params', () => {
  for (const p of PALETTES) {
    if (p.family === 'overlay') {
      for (const [name, value] of Object.entries(p.colors)) {
        assert.match(value, HEX, `${p.id}.${name} = ${value}`);
      }
      assert.equal(Object.keys(p.colors).length, 9);
    } else {
      for (const v of Object.values(p.params)) {
        assert.equal(typeof v, 'number');
        assert.ok(v >= 0 && v <= 200, `${p.id} param out of range: ${v}`);
      }
    }
  }
});

test('findPalette returns exact match, falls back to nv-simple', () => {
  assert.equal(findPalette('nv-midnight').id, 'nv-midnight');
  assert.equal(findPalette('nope').id, 'nv-simple');
});

// Added post-review (border-contrast fix): every overlay border must stay
// visible against its bg (luminance delta >= 14, linear 0.2126/0.7152/0.0722).
test('every overlay border is visible against its bg (luminance delta >= 14)', () => {
  const lum = (hex) => {
    const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  for (const p of PALETTES) {
    if (p.family !== 'overlay') continue;
    const delta = Math.abs(lum(p.colors.border) - lum(p.colors.bg)) * 100;
    assert.ok(delta >= 14, `${p.id} border-vs-bg luminance delta ${delta.toFixed(1)} < 14`);
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/palettes.test.mjs`
Expected: FAIL — Cannot find module `../../src/shared/palettes.js`

- [ ] **Step 3: 实现 palettes.js**

```js
// src/shared/palettes.js
// 40 classic-theme palettes (ADR-0002): 26 overlay palettes (9 colors each)
// and 14 invert palettes (filter params). All values are original designs —
// night-sky inspired names and hue families. Compact tuples keep the data
// scannable; overlay() expands them.

const overlay = (id, label, tuple) => {
  if (tuple.length !== 9) throw new Error(`overlay ${id}: expected 9 colors, got ${tuple.length}`);
  const [bg, surface, fg, muted, link, visited, cite, inputBg, border] = tuple;
  return {
    id, family: 'overlay', label,
    colors: { bg, surface, fg, muted, link, visited, cite, inputBg, border },
  };
};

const invert = (id, label, tuple) => {
  if (tuple.length !== 3) throw new Error(`invert ${id}: expected 3 params, got ${tuple.length}`);
  const [brightness, contrast, grayscale] = tuple;
  return {
    id, family: 'invert', label,
    params: { brightness, contrast, grayscale },
  };
};

export const PALETTES = [
  // ---- 26 overlay palettes ----
  overlay('nv-simple',   'Evening',      ['#1e2229', '#262b33', '#e8e6e0', '#a8a49c', '#7fabec', '#d293c8', '#82d4a4', '#2b303a', '#4a4f58']),
  overlay('nv-midnight', 'Midnight',     ['#12141d', '#181b26', '#dfe3ee', '#9aa0b5', '#8ea2d8', '#b48ecf', '#8fd4b0', '#171a24', '#3d414f']),
  overlay('nv-pitch',    'Pitch',        ['#0a0a0b', '#101012', '#e6e6e6', '#9c9c9c', '#9aa8ff', '#c9a0e8', '#8fd8a8', '#101013', '#37373b']),
  overlay('nv-amoled',   'AMOLED',       ['#000000', '#0c0c0c', '#f0f0f0', '#a6a6a6', '#88aaff', '#cf9de0', '#90e0a8', '#0d0d0d', '#2d2d2d']),
  overlay('nv-graphite', 'Graphite',     ['#232323', '#2b2b2b', '#e9e7e2', '#a9a49d', '#9cb8e6', '#c88fdd', '#97d9a5', '#2e2e2e', '#505050']),
  overlay('nv-slate',    'Slate',        ['#1f2428', '#282e33', '#e5e9ec', '#a3abb1', '#8fb6e8', '#c390d8', '#8fd6b2', '#293036', '#4a5158']),
  overlay('nv-storm',    'Storm',        ['#1a1e24', '#22272f', '#e4e7ec', '#9fa7b3', '#84aee0', '#bb8bd4', '#87cfa8', '#242a33', '#444c56']),
  overlay('nv-navy',     'Navy',         ['#131a26', '#1a2331', '#e2e8f2', '#98a6bb', '#89a9e8', '#b48ed6', '#8ad2b4', '#182130', '#3a4859']),
  overlay('nv-steel',    'Steel',        ['#252a2f', '#2e343a', '#e8ebef', '#a8aeb5', '#94b4e4', '#c493da', '#93d8ac', '#333940', '#50575e']),
  overlay('nv-ice',      'Ice',          ['#1d2733', '#25303e', '#e8f0f8', '#a4b3c4', '#8fc0f0', '#c0a2e4', '#8fdcc2', '#232f3e', '#465568']),
  overlay('nv-glacier',  'Glacier',      ['#18222c', '#202c38', '#e6eef6', '#9fb0c0', '#86b8ea', '#b99ade', '#85d4ba', '#1e2a37', '#405061']),
  overlay('nv-frost',    'Frost',        ['#20242c', '#282e38', '#eaeef4', '#a8b0be', '#9cc2ec', '#c8a2e0', '#9adec2', '#2a313d', '#4a515e']),
  overlay('nv-coffee',   'Coffee',       ['#211a14', '#2b231b', '#ede4d8', '#b0a391', '#d9a86c', '#d68cc0', '#a8d9a0', '#2f261e', '#52473c']),
  overlay('nv-mocha',    'Mocha',        ['#251d18', '#2f2620', '#efe6dd', '#b3a596', '#e0b078', '#db98c8', '#b0dcaa', '#332a23', '#554a41']),
  overlay('nv-ember',    'Ember',        ['#241816', '#2e201d', '#f0e4dc', '#b29d93', '#f0a074', '#d890c4', '#a8dca4', '#332421', '#58443f']),
  overlay('nv-amber',    'Amber',        ['#231c10', '#2d2416', '#f2e9d4', '#b5a884', '#f0b860', '#d898c8', '#b0dc9a', '#312818', '#554935']),
  overlay('nv-honey',    'Honey',        ['#26200f', '#302914', '#f4ecd2', '#b7ab86', '#f0c868', '#dc9ecb', '#b4e0a0', '#352c17', '#584d31']),
  overlay('nv-twilight', 'Twilight',     ['#191627', '#201c31', '#e9e5f4', '#a49ec0', '#98a8f0', '#c89ade', '#92d4c2', '#1e1a30', '#48415e']),
  overlay('nv-dusk',     'Dusk',         ['#1e1723', '#271e2d', '#ece3f0', '#ada0b7', '#a898e4', '#d094d8', '#a0d4bc', '#261d30', '#4f4258']),
  overlay('nv-owl',      'Owl',          ['#1b2016', '#242a1d', '#e9eee0', '#a8b09a', '#b8d078', '#cb9ad0', '#9ad8a8', '#252c1f', '#464e3c']),
  overlay('nv-fern',     'Fern',         ['#141f18', '#1a281f', '#e2eee6', '#97b0a1', '#7cc898', '#b28fd6', '#7fd8b8', '#192820', '#3a4e43']),
  overlay('nv-moss',     'Moss',         ['#1a201a', '#232b23', '#e6ece4', '#a2b0a4', '#8cc88e', '#bb96d2', '#8cd4b0', '#222c23', '#434f42']),
  overlay('nv-tidal',    'Tidal',        ['#122028', '#182b35', '#e0eef4', '#93aebc', '#70c0d8', '#aa9cd8', '#78d0c0', '#172a34', '#35505d']),
  overlay('nv-lagoon',   'Lagoon',       ['#10241e', '#16302a', '#e0f0ea', '#92b0a7', '#6cc4a8', '#a898d4', '#74d0bc', '#152e27', '#32544b']),
  overlay('nv-violet',   'Violet',       ['#1d1626', '#261d31', '#eae2f2', '#ab9ec0', '#b090ec', '#e09ade', '#a0d4c4', '#251c33', '#4e415f']),
  overlay('nv-rose',     'Rose',         ['#241618', '#2e1d1f', '#f2e4e6', '#b59da1', '#ec9ab0', '#d894dc', '#b0dca4', '#322023', '#574144']),
  // ---- 14 invert palettes ----
  invert('nv-inv-soft',       'Invert Soft',       [95, 95, 0]),
  invert('nv-inv-soft-plus',  'Invert Soft Plus',  [100, 100, 0]),
  invert('nv-inv-balanced',   'Invert Balanced',   [105, 105, 0]),
  invert('nv-inv-balanced-plus', 'Invert Balanced Plus', [110, 110, 0]),
  invert('nv-inv-strong',     'Invert Strong',     [115, 115, 0]),
  invert('nv-inv-strong-plus', 'Invert Strong Plus', [120, 120, 0]),
  invert('nv-inv-crisp',      'Invert Crisp',      [100, 130, 0]),
  invert('nv-inv-deep',       'Invert Deep',       [85, 105, 0]),
  invert('nv-inv-warm',       'Invert Warm',       [105, 100, 10]),
  invert('nv-inv-cool',       'Invert Cool',       [100, 110, 5]),
  invert('nv-inv-mono',       'Invert Mono',       [100, 105, 100]),
  invert('nv-inv-mono-soft',  'Invert Mono Soft',  [92, 95, 100]),
  invert('nv-inv-mono-strong', 'Invert Mono Strong', [112, 125, 100]),
  invert('nv-inv-ultra',      'Invert Ultra',      [125, 125, 0]),
];

export function findPalette(id) {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/palettes.test.mjs`
Expected: 4 pass（含 2026-09-12 增补的 border ΔL≥14 回归测试）

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test` → Expected: 12 pass（2026-09-12 边界对比度修复 +1 测试后）

```bash
git add src/shared/palettes.js tests/unit/palettes.test.mjs
git commit -m "feat: 40 original classic-theme palettes (26 overlay + 14 invert)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 主题编译器（Overlay / Invert 模板）（TDD）

**Files:**
- Create: `src/shared/themes.js`
- Create: `tests/unit/themes.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `PALETTES`/`findPalette`（编译器接收 palette 对象，不依赖查找）
- Produces: `export function compileTheme(palette) : string`（Overlay palette → 覆盖式 CSS；Invert palette → 反色式 CSS；family 未知抛 `Error('unknown family: …')`）；`export function compileThemeById(id) : string`（= `compileTheme(findPalette(id))`）

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/themes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTheme, compileThemeById } from '../../src/shared/themes.js';
import { findPalette, PALETTES } from '../../src/shared/palettes.js';

test('overlay compilation embeds all 9 palette colors and core selectors', () => {
  const css = compileTheme(findPalette('nv-simple'));
  for (const value of Object.values(findPalette('nv-simple').colors)) {
    assert.ok(css.includes(value), `missing color ${value}`);
  }
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /body :is\(a:link, a:link \*\):is\(#nv-sheet, \*\)/);
  assert.match(css, /body :is\(a:visited, a:visited \*\):is\(#nv-sheet, \*\)/);
  assert.match(css, /body input,\s*body textarea,\s*body select/);
  assert.match(css, /background-image:\s*none\s*!important/);
  assert.match(css, /body \* {[^}]*background-color/s);
  assert.match(css, /body :is\(#nv-sheet, \*\):not\(\[data-nv-stage\]\):not\(\[data-nv-stage\] \*\) \{ background-image: none !important; \}/);
  assert.match(css, /body :is\(#nv-sheet, \*\) \{\n  color: /, 'color lift selector missing');
  assert.match(css, /body :is\(#nv-sheet, \*\) \{[^}]*text-indent: 0 !important/s, 'text-indent recall missing');
  assert.ok(css.includes('body :is(cite, q, blockquote):is(#nv-sheet, *)'), 'cite specificity lift missing');
  assert.match(css, /body \[data-nv-stage\], body \[data-nv-stage\] \* \{ background-color: transparent !important; \}/);
});

test('invert compilation carries filter params and protection list', () => {
  const css = compileTheme(findPalette('nv-inv-balanced'));
  assert.match(css, /filter:\s*invert\(100%\)/);
  assert.match(css, /brightness\(105%\)/);
  assert.match(css, /contrast\(105%\)/);
  assert.match(css, /img, video, canvas, iframe, embed, object, svg image/, 'media protection list missing');
  assert.equal(
    css.split('filter: invert(100%) hue-rotate(180deg);').length - 1,
    1,
    'media protection must re-apply inversion only (no tone params)',
  );
});

test('every palette compiles to non-empty css; unknown family throws; id helper works', () => {
  for (const p of PALETTES) {
    const css = compileTheme(p);
    assert.ok(typeof css === 'string' && css.length > 200, `${p.id} compiled too small`);
  }
  assert.throws(() => compileTheme({ id: 'x', family: 'nope' }), /unknown family/);
  assert.equal(compileThemeById('nv-midnight'), compileTheme(findPalette('nv-midnight')));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/themes.test.mjs`
Expected: FAIL — Cannot find module `../../src/shared/themes.js`

- [ ] **Step 3: 实现 themes.js**

```js
// src/shared/themes.js
// Compiles a palette into injectable CSS. Two families (ADR-0002):
//  - overlay: original selector set overriding text/background/link colors
//  - invert: whole-page filter inversion with a media protection list
import { findPalette } from './palettes.js';

export function compileTheme(palette) {
  if (palette.family === 'overlay') return overlayCss(palette);
  if (palette.family === 'invert') return invertCss(palette);
  throw new Error(`unknown family: ${palette.family}`);
}

export function compileThemeById(id) {
  return compileTheme(findPalette(id));
}

function overlayCss({ colors: c }) {
  return `
html { color-scheme: dark; }
html, body {
  background-color: ${c.bg} !important;
  background-image: none !important;
}
body * {
  background-color: ${c.bg} !important;
}
body :is(#nv-sheet, *):not([data-nv-stage]):not([data-nv-stage] *) { background-image: none !important; }
/* :is(#nv-sheet, *) 匹配所有元素——纯特异性提升器（ID 级 (1,0,1)），不是内容过滤器，勿清理 */
body :is(#nv-sheet, *) {
  color: ${c.fg} !important;
  border-color: ${c.border} !important;
  text-indent: 0 !important;
}
body :is(a:link, a:link *):is(#nv-sheet, *) { color: ${c.link} !important; }
body :is(a:visited, a:visited *):is(#nv-sheet, *) { color: ${c.visited} !important; }
body :is(cite, q, blockquote):is(#nv-sheet, *) { color: ${c.cite} !important; }
body :is(#nv-sheet, *)::placeholder { color: ${c.muted} !important; opacity: 1 !important; }
/* input/button 的 color 当前与提升后的平铺同值（冗余无害）；将来分化时需同步 :is 提升 */
body input, body textarea, body select {
  background-color: ${c.inputBg} !important;
  color: ${c.fg} !important;
}
body button {
  background-color: ${c.surface} !important;
  color: ${c.fg} !important;
}
::selection { background-color: ${c.link} !important; color: ${c.bg} !important; }
body img, body video, body canvas, body iframe, body embed, body object, body picture, body svg {
  background-color: transparent !important;
}
body [data-nv-stage], body [data-nv-stage] * { background-color: transparent !important; }
`.trim();
}

function invertCss({ params: p }) {
  const filter = `invert(100%) hue-rotate(180deg) brightness(${p.brightness}%) contrast(${p.contrast}%) grayscale(${p.grayscale}%)`;
  return `
html { color-scheme: dark; }
html {
  background-color: #ffffff !important;
  filter: ${filter};
}
body { background-color: #ffffff !important; }
img, video, canvas, iframe, embed, object, svg image {
  filter: invert(100%) hue-rotate(180deg);
}
`.trim();
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/themes.test.mjs`
Expected: 3 pass

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test` → Expected: 14 pass

```bash
git add src/shared/themes.js tests/unit/themes.test.mjs
git commit -m "feat: overlay/invert theme compiler for classic palettes

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: content 注入管线 + plain 验收页

**Files:**
- Modify: `src/content/main.js`（全量重写）
- Create: `tests/fixtures/plain.html`
- Create: `src/shared/icons.js`（本任务顺带落地——content 不用，但它是 Task 5 的依赖，属同一波"shared 纯函数"交付）
- Test: `tests/unit/icons-map.test.mjs`（icons.js 的纯函数单测；DOM 注入本身由 Task 6 的 tabbit 端到端覆盖，node 层无 DOM）

**Interfaces:**
- Consumes: Task 1 `loadSettings/subscribeSettings`；Task 3 `compileThemeById`
- Produces:
  - content 行为契约（Task 6 验收依据）：`state === 'dark'` 时文档中出现 `<style id="nv-classic">`（内容为编译后 CSS）；`light` 或收到变更为 light 时该元素移除；`<style id="nv-guard">`（Flash Guard 简单暗样式）在 dark 时注入、`window` load 事件后 200ms 移除；console 仅保留 `[NightVeil] content script active` 一行
  - `icons.js`: `export function iconPathsFor(state)` 返回 `{ 16, 32, 48, 64 }` 路径对象（dark → `icons/dark/*.png`，其余 → `icons/light/*.png`）

- [ ] **Step 1: 写 icons 纯函数失败测试**

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/icons-map.test.mjs`
Expected: FAIL — Cannot find module `../../src/shared/icons.js`

- [ ] **Step 3: 实现 icons.js**

```js
// src/shared/icons.js
// Toolbar icon path mapping (pure — shared with tests and the service worker).
export function iconPathsFor(state) {
  const set = state === 'dark' ? 'dark' : 'light';
  return {
    16: `icons/${set}/16.png`,
    32: `icons/${set}/32.png`,
    48: `icons/${set}/48.png`,
    64: `icons/${set}/64.png`,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/icons-map.test.mjs` → Expected: 1 pass

- [ ] **Step 5: 写 plain 验收页**

```html
<!-- tests/fixtures/plain.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <link rel="icon" href="data:,">
    <title>NightVeil plain fixture</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; }
      #nv-probe { background: #ffffff; color: #111111; padding: 1rem; border: 1px solid #cccccc; }
      blockquote { border-left: 3px solid #999; margin-left: 0; padding-left: 1rem; }
    </style>
  </head>
  <body>
    <h1>Plain fixture</h1>
    <div id="nv-probe">
      <p>Probe paragraph with a <a href="https://example.com/">link</a> and a <a href="https://example.com/">visited-style placeholder</a>.</p>
      <p>Text colors, borders, inputs and buttons below are the assertion targets.</p>
    </div>
    <blockquote id="nv-quote">A quotation for cite styling.</blockquote>
    <form id="nv-form">
      <input id="nv-input" type="text" placeholder="type here">
      <button id="nv-button" type="button">Button</button>
    </form>
  </body>
</html>
```

- [ ] **Step 6: 重写 content/main.js**

```js
// src/content/main.js
// Content pipeline: read settings at document_start, inject/remove the
// classic theme, apply a flash guard while active, and re-render on changes.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, subscribeSettings } from '../shared/settings.js';
import { compileThemeById } from '../shared/themes.js';

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
function armGuard() {
  injectStyle(GUARD_STYLE_ID, 'html { background-color: #1e2229 !important; }');
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

// 图截文字第二式——字号归零藏字召回；风险：依赖 fs:0 隐藏回退文字的真图标旁可能出现双渲染（backlog 已记）。
function recallZeroSizeText() {
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length !== 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.fontSize !== '0px') continue;
    // 从最近非零字号祖先取回字号，兜底 12px
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

function render(settings) {
  const active = settings.state === 'dark';
  if (active) {
    armGuard();
    injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));
    markMediaStages();
    recallZeroSizeText();
    // re-mark once the page finished loading — SPA players mount late;
    // videos added after load still wait for the next render.
    window.addEventListener('load', () => {
      if (document.getElementById(CLASSIC_STYLE_ID)) {
        markMediaStages();
        recallZeroSizeText();
      }
    }, { once: true });
  } else {
    // Light branch leaves prior dark-pass inline styles in place (harmless);
    // a light reload starts clean — acceptable v1.
    removeStyle(CLASSIC_STYLE_ID);
    removeStyle(GUARD_STYLE_ID);
    clearVideoStages();
  }
}

loadSettings().then(render);
subscribeSettings(render);
```

- [ ] **Step 7: 构建 + 全量回归**

Run: `npm run build && npm test`
Expected: build 输出 3 个 bundle；16 pass, 0 fail

- [ ] **Step 8: 提交**

```bash
git add src/content/main.js src/shared/icons.js tests/fixtures/plain.html tests/unit/icons-map.test.mjs
git commit -m "feat: content theming pipeline with flash guard, plain fixture page

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: service worker 状态管理（切换 + 图标/标题同步）

**Files:**
- Modify: `src/background/main.js`（全量重写）
- Test: 无新单测（chrome.* 绑定行为，Task 6 tabbit 端到端覆盖；纯逻辑已拆到 settings.js/icons.js 并有测试）

**Interfaces:**
- Consumes: Task 1 `loadSettings/saveSettings/subscribeSettings`、`STRINGS.stateTitleDark/stateTitleLight`；Task 4 `iconPathsFor`
- Produces: 工具栏行为契约（Task 6 验收依据）——点击 action 图标在 light/dark 间切换全局状态并持久化；图标与标题立即随状态更新；storage 变化（来自任何上下文）同样驱动图标/标题

- [ ] **Step 1: 重写 background/main.js**

```js
// src/background/main.js
// Global state owner: toolbar toggle + icon/title sync. State lives in
// chrome.storage.local (single object); content scripts re-render themselves.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, saveSettings, subscribeSettings } from '../shared/settings.js';
import { iconPathsFor } from '../shared/icons.js';

console.debug(STRINGS.swStartedDebug);

function refreshToolbar(settings) {
  const dark = settings.state === 'dark';
  chrome.action.setIcon({ path: iconPathsFor(settings.state) });
  chrome.action.setTitle({ title: dark ? STRINGS.stateTitleDark : STRINGS.stateTitleLight });
}

chrome.action.onClicked.addListener(async () => {
  const current = await loadSettings();
  await saveSettings({ state: current.state === 'dark' ? 'light' : 'dark' });
});

loadSettings().then(refreshToolbar);
subscribeSettings(refreshToolbar);
```

- [ ] **Step 2: 构建 + 全量回归**

Run: `npm run build && npm test`
Expected: build 正常；16 pass, 0 fail

- [ ] **Step 3: 提交**

```bash
git add src/background/main.js
git commit -m "feat: toolbar toggle with persistent state and icon/title sync

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: tabbit 端到端验收（控制器亲自执行，不派子代理）

**Files:**
- Modify: `docs/MILESTONES.md`（勾选 M1a 覆盖的条目；M1 仍为 🟨，注明 M1a 完成）
- 无新代码

**Interfaces:**
- Consumes: Task 4/5 的行为契约；`tests/fixtures/plain.html`；自主迭代.md 协议
- Produces: M1a 验收记录（M1b 的基线）

- [ ] **Step 1: 构建并启动 fixtures**

Run: `npm run build`（Expected: 3 bundle 输出）
Run（后台）: `npm run fixtures`
**人工步骤**：请用户在 `chrome://extensions` 重载 NightVeil（M0 已加载的 unpacked 扩展，点刷新图标即可），并确认卡片无 Errors。

- [ ] **Step 2: 初始态断言（light）**

tabbit `nodejs --task nightveil-m1a`：
```js
let p = (typeof page !== 'undefined' && page && !page.isClosed()) ? page : await context.newPage();
await p.goto('http://localhost:8123/plain.html', {waitUntil: 'load'});
const probeBg = await p.locator('#nv-probe').evaluate((el) => getComputedStyle(el).backgroundColor);
return {probeBg, styleCount: await p.locator('style[id^="nv-"]').count()};
```
Expected: `probeBg === 'rgb(255, 255, 255)'`（fixture 白底未被改写），`styleCount === 0`

- [ ] **Step 3: 人工切换到 Dark（第一次人工点击）**

**人工步骤**：请用户点击工具栏 NightVeil 图标一次。
tabbit（同任务续帧）：
```js
await p.reload({waitUntil: 'load'});
await p.waitForTimeout(400); // guard 移除窗口
const probeBg = await p.locator('#nv-probe').evaluate((el) => getComputedStyle(el).backgroundColor);
const probeFg = await p.locator('#nv-probe').evaluate((el) => getComputedStyle(el).color);
const classic = await p.locator('#nv-classic').count();
const guard = await p.locator('#nv-guard').count();
return {probeBg, probeFg, classic, guard};
```
Expected: `probeBg === 'rgb(30, 34, 41)'`（`#1e2229`，nv-simple 默认主题 bg）、`classic === 1`、`guard === 0`（load+200ms 后已移除）、无未捕获异常
（不刷新直接断言也行——subscribe 应即时生效；两法都验：先不 reload 断言一次，再 reload 断言持久化。执行时按此顺序各取一次证据。）

- [ ] **Step 4: 切回 Light（第二次人工点击）+ 持久化反证**

**人工步骤**：请用户再点击一次图标。
tabbit 断言（不 reload）：`#nv-classic` count === 0、probe 恢复 `rgb(255, 255, 255)`；随后 reload 再断言仍为 light（持久化）。

- [ ] **Step 5: 回归与判定**

Run: `npm test` → 16 pass。
对照验收：①无报错加载（用户确认）②console 无未捕获异常（tabbit pageErrors）③dark/light 切换与持久化 ✅ ④回归绿。任一失败 → 按自主迭代协议回到代码修改；同问题 3 次失败停止上报。

- [ ] **Step 6: 收口**

`npm run fixtures` 后台进程停掉；`docs/MILESTONES.md` 在 M1 区块下追加一行小节注记：`**M1a（2026-09-09 完成）**：核心切换与主题引擎已验收——覆盖条目：工具栏切换/图标标题、调色板引擎、40 主题编译、Flash Guard 基础版、文案单源；plain fixture 就绪`；提交：

```bash
git add docs/MILESTONES.md
git commit -m "docs: M1a accepted via tabbit

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Self-Review 记录

- **覆盖核对**（MILESTONES M1 条目 ↔ M1a 范围）：工具栏切换+图标标题→T5；参数化引擎（Overlay+Invert）→T3；40 主题→T2；Flash Guard 基础版→T4；文案单源断言→T1；plain fixture→T4；端到端验收→T6。**明确不在 M1a**（留 M1b）：右键菜单、排除/包含、站点主题、options 页、其余 5 张 fixture、真实站点抽查。
- **占位符扫描**：Task 3 曾写出动态 import 版 `compileThemeById` 又自我否决——已在正文标注"实现只写静态导入版本"，执行者有唯一可抄版本；其余无 TBD/TODO/无代码步骤。
- **类型/命名一致性**：`STORAGE_KEY='nightveil.settings'`（T1 定义、T1 测试用）；`findPalette`（T2 定义、T3/T4 用）；`compileThemeById(id)` 静态版（T3 定义、T4 用）；`iconPathsFor(state)`（T4 定义、T5 用）；strings 键 `stateTitleDark/stateTitleLight`（T1 定义、T5 用）；style 元素 id `nv-classic`/`nv-guard`（T4 定义、T6 断言用）。测试计数链（按测试数而非文件数）：4→8→12→14→16（2026-09-10 依实测修正；2026-09-12 边界对比度修复 +1 至 16）。
- **已知取舍**：切换的浏览器内触发无法自动化（tabbit 限制），T6 设计了两次人工点击 + tabbit 双向断言补偿；主题切换 UI（换 themeId）在 M1b options 页落地，M1a 以 40 主题全量编译单测覆盖正确性。
