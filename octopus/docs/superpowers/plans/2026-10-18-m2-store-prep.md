# M2 上架准备 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 octopus 推到可提交 Chrome Web Store 的状态:质量地板波(M1 种子)、版本 1.0.0 + 打包链、商店文案与隐私页、截图与小宣传图。

**Architecture:** 五任务串行——种子修复在代码层(纯函数 + 回调守卫);打包链是 node 脚本 + 系统 zip;文案/隐私页为仓内文档;截图用「serve 真实构建产物 + mock-chrome initScript 注入内存存储」让 options/popup 以完整模式渲染后实拍,合成板为静态 HTML;收尾门跑全量并交棒用户真机过目。

**Tech Stack:** Chrome MV3 扩展、原生 ES modules、node:test(`--test-isolation=none`)、esbuild(既有)、系统 `zip`/`unzip`/`sips`(macOS)。

**Spec:** `docs/superpowers/specs/2026-10-18-m2-store-prep-design.md`(用户已批准;四项裁定:种子并入首波 / 1.0.0 / 仅 CWS 中文 / 仓内隐私页)。

## Global Constraints

- `npm test` = `node --test --test-isolation=none` 全绿(当前 308/308);新增测试先红后绿;不许为绿降断言。
- 零运行时依赖:仅 node stdlib;打包与资产尺寸校验允许系统 `zip`/`unzip`/`sips`。
- 文案单源:新增 UI 文案一律进 `SHELL_STRINGS`(`src/shell/strings.js`);商店文档除外。
- 外科手术:只动各任务 Files 清单所列文件。
- 每个 commit 尾注:`Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 商店资产规格钉子:截图恰 1280×800、小宣传图恰 440×280、DPR 1。
- 诚实捕获:截图必须是真实构建产物的浏览器渲染(mock-chrome 只提供内存版 storage/runtime/tabs);不做手绘仿冒 UI 或夜幕页效果。
- 上架包根 = manifest.json(无外层目录、无点文件)。

---

### Task 1: 质量地板波 — 导入逐键卫生 / lastError / 空包文案 / FOUC / pace popup http 存活

**Files:**
- Modify: `src/shell/store.js:4-5`(IDS/WINGS 改导出)
- Modify: `src/shell/strings.js`(dataHint 后追加 7 键)
- Modify: `src/shell/options-general.js`(parseImportFile 逐键验形;export/import/reset 守卫;隐私提示行)
- Modify: `public/options.html:311`(veil 视图去硬编码 `is-on`)+ popup 预览样式核对
- Modify: `src/tools/pace/shared/paceMath.js:41-43`(stepSkip 非有限守卫)
- Modify: `src/tools/pace/popup/main.js`(line 3 导入、line 13 可选链、boot IIFE 头部 catch)
- Test: `tests/shell/options-general.test.mjs`(重写)、`tests/pace/pace-math.test.mjs`(追加用例)

**Interfaces:**
- Produces: `parseImportFile(text)` 新契约——`null`=非本扩展文件;`{}`=合法包但无已知键内容;键脏丢键不丢包;`vpa.settings` 数值经 clampPace 夹取。
- Produces: `store.js` 新导出 `IDS`、`WINGS`(后续任务可引用,本任务仅 parseImportFile 用)。
- Consumes: `clampPace`(既有,`src/tools/pace/shared/paceMath.js`)。

**背景事实(已核实):** pace `loadSettings` 读侧不夹取(`{...DEFAULTS, ...stored}` 直透,`src/tools/pace/shared/store.js:23`),导入侧验形是真防线;JSON 无 NaN/Infinity,脏数值向量是字符串数/`null`/负值;pace popup `main.js:13` 模块顶 `chrome.runtime.getManifest()` 在 http 挂载下同步抛错杀死整个 popup bundle。

- [ ] **Step 1: 写失败测试(options-general 新契约)**

`tests/shell/options-general.test.mjs` 整文件替换为:

```js
// tests/shell/options-general.test.mjs — 导入白名单与逐键卫生(纯函数)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportFile, EXPORT_KEYS } from '../../src/shell/options-general.js';

const wrap = (data) => JSON.stringify({ app: 'octopus', exportedAt: '2026-10-18T00:00:00Z', data });

test('合法导入:已知键全收,未知键丢弃', () => {
  const out = parseImportFile(wrap({ 'nightveil.settings': { state: 'dark' }, 'vpa.settings': { pace: 2 }, 'oct.shell': { activeTool: 'veil' }, evil: { x: 1 } }));
  assert.deepEqual(out['nightveil.settings'], { state: 'dark' });
  assert.equal(out['vpa.settings'].pace, 2);
  assert.deepEqual(out['oct.shell'], { activeTool: 'veil' });
  assert.equal('evil' in out, false);
});

test('结构性拒收一律 null:坏 JSON / 非 octopus / data 非对象 / 键值非对象', () => {
  assert.equal(parseImportFile('{oops'), null);
  assert.equal(parseImportFile(JSON.stringify({ app: 'other', data: {} })), null);
  assert.equal(parseImportFile(JSON.stringify({ app: 'octopus', data: [1] })), null);
  assert.equal(parseImportFile(wrap({ 'vpa.settings': 'nope' })), null);
});

test('空导出再导入:合法包无已知键 → {}(调用方据此提示「没有可导入的数据」)', () => {
  assert.deepEqual(parseImportFile(wrap({})), {});
});

test('vpa 数值脏(字符串数/null/越界片秒)→ 丢 vpa 键,其余键保留', () => {
  const keep = { 'oct.shell': { activeWing: 'pace' } };
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { pace: 'fast', hold: true }, ...keep })), keep);
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { introSkip: null }, ...keep })), keep);
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { outroSkip: -5 }, ...keep })), keep);
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { introSkip: 9999 }, ...keep })), keep);
});

test('vpa 布尔脏 → 丢 vpa 键', () => {
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { hold: 'yes' }, 'oct.shell': { activeWing: 'pace' } })), { 'oct.shell': { activeWing: 'pace' } });
});

test('vpa 档位越界经 clampPace 夹取:99→16、0.001→0.07', () => {
  const out = parseImportFile(wrap({ 'vpa.settings': { pace: 99, heldPace: 0.001 } }));
  assert.equal(out['vpa.settings'].pace, 16);
  assert.equal(out['vpa.settings'].heldPace, 0.07);
});

test('oct.shell 值脏:activeWing 不在翼集 → 丢键;合法值原样保留', () => {
  assert.deepEqual(parseImportFile(wrap({ 'oct.shell': { activeWing: 'evil' }, 'vpa.settings': { pace: 2 } })), { 'vpa.settings': { pace: 2 } });
  assert.deepEqual(parseImportFile(wrap({ 'oct.shell': { activeTool: 'pace', activeWing: 'gen' } }))['oct.shell'], { activeTool: 'pace', activeWing: 'gen' });
});

test('导出键白名单恰为三键', () => {
  assert.deepEqual([...EXPORT_KEYS].sort(), ['nightveil.settings', 'oct.shell', 'vpa.settings']);
});
```

- [ ] **Step 2: 写失败测试(stepSkip 非有限)**

`tests/pace/pace-math.test.mjs` 末尾追加:

```js
test('stepSkip:非有限入参按 min 起步,不再传播 NaN', () => {
  assert.equal(stepSkip(NaN, 5), 5);
  assert.equal(stepSkip(undefined, 5), 5);
  assert.equal(stepSkip('x', -5), 0);
});
```

- [ ] **Step 3: 跑红**

Run: `node --test tests/shell/options-general.test.mjs tests/pace/pace-math.test.mjs`
Expected: FAIL(新契约用例红;旧实现返回 null 而非 `{}`、无逐键卫生、stepSkip 传播 NaN)。

- [ ] **Step 4: 实现 — store.js 导出 IDS/WINGS**

`src/shell/store.js:4-5`,`const` 改 `export const`(两行,Set 内容不动):

```js
export const IDS = new Set(['veil', 'pace']); // 与 registry 同步;M0 硬编码,第三个工具时改由 registry 注入
export const WINGS = new Set(['veil', 'pace', 'gen']); // options 三翼;gen=通用(非工具)
```

- [ ] **Step 5: 实现 — strings.js 新键**

`src/shell/strings.js` 的 `dataHint` 行后追加:

```js
  dataPrivacyNote: '导出文件包含站点名单与全部设置,只保存到你选择的下载路径。',
  importBadFile: '导入失败:不是 Octopus 设置文件',
  importEmpty: '这个文件里没有可导入的数据',
  importReadFail: '读取文件失败,请重试',
  storageWriteFail: '写入失败,请重试',
  storageReadFail: '读取设置失败,请重试',
  resetConfirm: '全部恢复默认?两个工具的设置与壳状态都会清空。',
```

- [ ] **Step 6: 实现 — options-general.js 逐键验形与守卫**

文件头 import 区(`SHELL_STRINGS` 与 veil settings 之后)追加:

```js
import { clampPace } from '../tools/pace/shared/paceMath.js';
import { IDS, WINGS } from './store.js';
```

`parseImportFile` 整函数替换为:

```js
// 逐键验形:结构层(键值非对象)整体拒;语义层(字段脏)丢键不丢包。
// 返回 null=不是本扩展的设置文件;{}=合法包但无已知键内容(空导出)。
// 依据:pace loadSettings 读侧不夹取({...DEFAULTS, ...stored} 直透),
// 导入侧是脏数值(字符串数/null/负片秒)进入运行时的最后一道闸。
const PACE_RANGE = { introSkip: [0, 3600], outroSkip: [0, 3600] };

function sanitizePace(v) {
  for (const f of ['pace', 'heldPace']) {
    if (v[f] !== undefined && !Number.isFinite(v[f])) return null;
  }
  for (const [f, [lo, hi]] of Object.entries(PACE_RANGE)) {
    if (v[f] !== undefined && !(Number.isFinite(v[f]) && v[f] >= lo && v[f] <= hi)) return null;
  }
  for (const f of ['hold', 'skipOn', 'autoAdvance']) {
    if (v[f] !== undefined && typeof v[f] !== 'boolean') return null;
  }
  const out = { ...v };
  if (out.pace !== undefined) out.pace = clampPace(out.pace);
  if (out.heldPace !== undefined) out.heldPace = clampPace(out.heldPace);
  return out;
}

function sanitizeShell(v) {
  if (v.activeTool !== undefined && !IDS.has(v.activeTool)) return null;
  if (v.activeWing !== undefined && !WINGS.has(v.activeWing)) return null;
  return { ...v };
}

export function parseImportFile(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!parsed || parsed.app !== 'octopus' || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) return null;
  const out = {};
  for (const k of EXPORT_KEYS) {
    const v = parsed.data[k];
    if (v === undefined) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    let clean = v;
    if (k === 'vpa.settings') { clean = sanitizePace(v); if (!clean) continue; }
    else if (k === 'oct.shell') { clean = sanitizeShell(v); if (!clean) continue; }
    out[k] = clean;
  }
  return out;
}
```

`exportData`/`importData`/`resetAll` 三函数整体替换为:

```js
function exportData() {
  chrome.storage.local.get(EXPORT_KEYS, (records) => {
    if (chrome.runtime.lastError) { alert(SS.storageReadFail); return; }
    const blob = new Blob([JSON.stringify({ app: 'octopus', exportedAt: new Date().toISOString(), data: records ?? {} }, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `octopus-settings-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  });
}

function importData() {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', () => {
    const file = input.files?.[0]; if (!file) return;
    file.text()
      .then((text) => {
        const parsed = parseImportFile(text);
        if (parsed === null) { alert(SS.importBadFile); return; }
        if (!Object.keys(parsed).length) { alert(SS.importEmpty); return; }
        chrome.storage.local.set(parsed, () => {
          if (chrome.runtime.lastError) { alert(SS.storageWriteFail); return; }
          location.reload();
        });
      })
      .catch(() => alert(SS.importReadFail));
  });
  input.click();
}

function resetAll() {
  if (!confirm(SS.resetConfirm)) return;
  chrome.storage.local.remove(EXPORT_KEYS, () => {
    if (chrome.runtime.lastError) { alert(SS.storageWriteFail); return; }
    location.reload();
  });
}
```

数据区 hint 行(`render` 内 `dataSec.append(...)` 的 `el('p', { class: 'hint' }, SS.dataHint)`)改为两行:

```js
    el('p', { class: 'hint' }, SS.dataHint),
    el('p', { class: 'hint' }, SS.dataPrivacyNote));
```

- [ ] **Step 7: 实现 — paceMath stepSkip 守卫**

`stepSkip` 整函数替换:

```js
export function stepSkip(current, delta, min = 0, max = 3600) {
  const c = Number.isFinite(Number(current)) ? Math.max(min, Number(current)) : min;
  return Math.min(max, Math.max(min, Math.round(c + delta)));
}
```

- [ ] **Step 8: 实现 — pace popup http 存活**

`src/tools/pace/popup/main.js`:
1. line 3:`import { loadSettings, saveSettings } from '../shared/store.js';` → `import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../shared/store.js';`
2. line 13:`if (verEl) verEl.textContent = chrome.runtime.getManifest().version;` →
   ```js
   if (verEl) verEl.textContent = globalThis.chrome?.runtime?.getManifest()?.version ?? '';
   ```
3. boot IIFE 头部(`(async () => {` 后的 `const settings = await loadSettings();`)替换为:
   ```js
   (async () => {
     let settings;
     try {
       settings = await loadSettings();
     } catch { // http 挂载(无 chrome.storage):预览降级 —— 默认值渲染 + data-preview 标记
       settings = { ...DEFAULT_SETTINGS };
       document.body.setAttribute('data-preview', '');
     }
     const pace = settings.pace;
   ```
   IIFE 其余行不动(IIFE 内后续的 `chrome.tabs.query` 已在 try 内,http 下走 catch 不炸)。
4. `public/popup.html`:grep `data-preview` — 若无规则则补 `body[data-preview] { opacity: .7; }`(与 options 预览态同语言;已有则不动)。

- [ ] **Step 9: 实现 — options FOUC**

`public/options.html:311`:`<div class="view is-on" data-wing="veil">` → `<div class="view" data-wing="veil">`(CSS `.view{display:none}`/`.view.is-on` 既有;首帧由 JS 显示记忆翼,错翼闪现消除)。

- [ ] **Step 10: 跑绿 + 全量 + build**

Run: `node --test tests/shell/options-general.test.mjs tests/pace/pace-math.test.mjs` → PASS
Run: `npm test` → 全绿(308 + 新增 ≈ 316)
Run: `npm run build` → 绿

- [ ] **Step 11: Commit**

```bash
git add src/shell/store.js src/shell/strings.js src/shell/options-general.js public/options.html public/popup.html src/tools/pace/shared/paceMath.js src/tools/pace/popup/main.js tests/shell/options-general.test.mjs tests/pace/pace-math.test.mjs
git commit -m "fix(m2): 质量地板波 — 导入逐键卫生/lastError 守卫/空包文案/FOUC/pace popup http 存活

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 版本 1.0.0 + npm run zip 打包链

**Files:**
- Modify: `package.json`(version 1.0.0;scripts 加 zip)
- Modify: `.gitignore`(加 `dist/`)
- Create: `scripts/zip.mjs`
- Test: `tests/shell/zip.test.mjs`

**Interfaces:**
- Produces: `npm run zip` → `dist/octopus-<version>.zip`(包根 manifest.json);zip.mjs 内置三处版本同步校验(package.json = extension/manifest.json = 文件名),不同步 exit 1。

- [ ] **Step 1: 写失败测试**

`tests/shell/zip.test.mjs` 新建:

```js
// tests/shell/zip.test.mjs — 打包链钉子:包根=manifest、关键 entry 在位、无点文件
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
execFileSync('npm', ['run', 'zip'], { cwd: root, stdio: 'ignore' });
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const listing = execFileSync('unzip', ['-l', path.join(root, 'dist', `octopus-${version}.zip`)], { encoding: 'utf8' });

test('zip:manifest 在包根,无 extension/ 前缀,无点文件', () => {
  assert.match(listing, / manifest\.json$/m);
  assert.doesNotMatch(listing, / extension\//);
  assert.doesNotMatch(listing, /\.DS_Store/);
});

test('zip:五入口 + 章鱼图标在位', () => {
  for (const f of ['background.js', 'popup.html', 'options.html', 'tools/veil/content.js', 'tools/pace/content.js', 'icons/toolbar/128.png']) {
    assert.match(listing, new RegExp(` ${f.replace(/\./g, '\\.')}$`), f);
  }
});

test('zip:产出 dist/octopus-<version>.zip', () => {
  assert.ok(existsSync(path.join(root, 'dist', `octopus-${version}.zip`)));
});
```

- [ ] **Step 2: 跑红**

Run: `node --test tests/shell/zip.test.mjs`
Expected: FAIL(`npm run zip` 不存在 → execFileSync 抛错)。

- [ ] **Step 3: 实现 zip.mjs + scripts + 版本**

`scripts/zip.mjs` 新建:

```js
// scripts/zip.mjs — 上架打包:extension/ → dist/octopus-<version>.zip(manifest 在包根)
// 系统 zip 打包,排除点文件;版本三处同步(package.json = manifest = 文件名)不同步即拒。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extDir = path.join(root, 'extension');
if (!existsSync(path.join(extDir, 'manifest.json'))) {
  console.error('[zip] 缺 extension/manifest.json —— 先 npm run build');
  process.exit(1);
}
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const manifestVersion = JSON.parse(readFileSync(path.join(extDir, 'manifest.json'), 'utf8')).version;
if (version !== manifestVersion) {
  console.error(`[zip] 版本不同步:package.json=${version} manifest=${manifestVersion}`);
  process.exit(1);
}
mkdirSync(path.join(root, 'dist'), { recursive: true });
const zipPath = path.join(root, 'dist', `octopus-${version}.zip`);
rmSync(zipPath, { force: true }); // zip 是增量更新语义,先清避免陈旧 entry
const r = spawnSync('zip', ['-X', '-r', zipPath, '.', '-x', '.*', '*.DS_Store'], { cwd: extDir, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`[zip] ${path.relative(root, zipPath)}`);
```

`package.json`:`"version": "0.1.0"` → `"1.0.0"`;scripts 加一行 `"zip": "npm run build && node scripts/zip.mjs"`。
`.gitignore` 末尾加 `dist/`。

- [ ] **Step 4: 跑绿 + 全量**

Run: `node --test tests/shell/zip.test.mjs` → PASS
Run: `npm test` → 全绿(含既有 manifest 测试——其 version 是显式传参的自包含断言,不受 package.json 影响)

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore scripts/zip.mjs tests/shell/zip.test.mjs
git commit -m "build(m2): 版本 1.0.0 + npm run zip 打包链(包根 manifest/版本三处同步/钉子测试)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 商店文案单源 + 隐私政策页

**Files:**
- Create: `docs/store/listing.zh.md`
- Create: `docs/privacy.zh.md`

**Interfaces:**
- Produces: listing 逐字段对照单(用户照单手工填 CWS 表单);隐私政策 URL `https://github.com/zz984230/chromeStore/blob/develop/octopus/docs/privacy.zh.md`。
- 图形资产文件名在此锁定(Task 4 按名产出):`s1-options-veil.png`、`s2-options-pace.png`、`s3-popup.png`、`s4-general.png`、`promo-440x280.png`(均在 `docs/store/assets/`)。

- [ ] **Step 1: 写 listing.zh.md(内容如下,可润色不可缺节)**

````markdown
# Chrome Web Store 上架文案(单源)

> 提交时照文末「填表对照单」逐字段粘贴。图形资产见 `docs/store/assets/`(清单文末)。

## 基本信息
- **名称**:Octopus
- **简述**(manifest description 原文,27 字符 ≤ 132):工具的瑞士军刀:暗色模式与视频倍速,更多工具持续加入。
- **类别**:生产力工具(Productivity)
- **语言**:中文(简体)

## 详细说明

Octopus 把常用浏览工具收进一个扩展,目前两件:

【夜幕】给网页换上舒适的深色。按站点开关并记住你的名单、色温调节、定时日落自动开启;自适应引擎尽量保留图片与视频原色。
【倍速】任意网站的视频调速,0.07×–16×。保持模式记住档位、新视频自动套用;片头片尾一键跳过;自动续播切下一集。

快捷键:Alt+. 加档 / Alt+, 减档 / Alt+0 回正 1× / Alt+L 切换保持。

全部设置只保存在你的浏览器本地,不联网、不收集数据。需要「读取和更改所有网站」权限,是因为两个工具都要在你打开的页面上就地工作。

## 权限正当性(逐条)

| 权限 | 用途 |
| --- | --- |
| `storage` | 设置保存在浏览器本地(chrome.storage.local) |
| `contextMenus` | 右键菜单把当前站点加入/移出夜幕名单 |
| `alarms`(可选) | 定时到点自动开/关夜幕(不授权则该功能禁用) |
| `<all_urls>`(主机权限) | 夜幕要在你指定的任意站点生效、倍速要在任意视频站发现播放器;两者都只在你打开的页面上本地运行,不发送数据 |

## 数据使用(隐私 tab)

全部不勾选 —— 不收集网页活动、不收集个人身份信息、无内容过滤上报;扩展无服务器、无统计、无错误上报。

## 隐私政策 URL

https://github.com/zz984230/chromeStore/blob/develop/octopus/docs/privacy.zh.md

## 图形资产清单

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `docs/store/assets/s1-options-veil.png` | 1280×800 | 截图 1 · 设置页夜幕翼 |
| `docs/store/assets/s2-options-pace.png` | 1280×800 | 截图 2 · 设置页倍速翼 |
| `docs/store/assets/s3-popup.png` | 1280×800 | 截图 3 · 工具栏弹窗 |
| `docs/store/assets/s4-general.png` | 1280×800 | 截图 4 · 设置页通用翼 |
| `docs/store/assets/promo-440x280.png` | 440×280 | 小宣传图 |
| (manifest 自带 `icons/toolbar/128.png`) | 128×128 | 商店图标 |

## 填表对照单

| 表单字段 | 填入值 |
| --- | --- |
| 名称 | Octopus |
| 简短描述 | 工具的瑞士军刀:暗色模式与视频倍速,更多工具持续加入。 |
| 详细说明 | 上「详细说明」节全文 |
| 类别 | 生产力工具 |
| 语言 | 中文(简体) |
| 图标 | manifest 自带,无需另传 |
| 截图 ×4 | 资产清单 s1–s4 |
| 小宣传图 | promo-440x280.png |
| 隐私政策 URL | 上「隐私政策 URL」 |
| 数据使用披露 | 全部不勾 |
| 权限理由(如审查问询) | 上「权限正当性」逐条 |
````

- [ ] **Step 2: 写 privacy.zh.md(内容如下)**

````markdown
# Octopus 隐私政策

生效日期:2026-10-18 · 适用:Chrome 网上应用店发行的 Octopus 扩展

## 我们收集什么

什么都不收集。Octopus 没有账号体系、没有统计分析、没有错误上报、没有广告,也没有任何服务器。

## 数据存在哪

全部在你浏览器的 `chrome.storage.local` 里,共三个键:

- `nightveil.settings` — 夜幕设置(含站点名单)
- `vpa.settings` — 倍速设置(档位/跳过/续播)
- `oct.shell` — 壳状态(上次使用的工具与设置页分栏)

设置页「通用 → 数据」可导出为 JSON 文件或全部清除;导出文件只写入你选择的下载路径。

## 网络行为

唯一一类网络请求:夜幕的自适应引擎会让扩展后台替当前网页读取**该网页自己引用的** CSS 样式表(用于计算深色配色)。请求只发往该页面本身已在用的地址,不携带任何你的数据,结果也不离开本机。除此之外,扩展零网络请求。

## 权限用途

- `storage`:本地保存设置
- `contextMenus`:右键把当前站点加入/移出夜幕名单
- `alarms`(可选):定时自动开关夜幕
- 所有网址:夜幕与倍速需要在你打开的任意页面上就地生效,一切计算都在本机、页面内完成

## 政策变更

如有实质变更,更新本页并随商店更新说明公告。
````

- [ ] **Step 3: 完整性核对**

Run: `grep -c "storage\|contextMenus\|alarms\|all_urls" docs/store/listing.zh.md` → ≥4(四权限齐);`grep -c "nightveil.settings\|vpa.settings\|oct.shell" docs/privacy.zh.md` → ≥3。
人工目检:详细说明与 manifest description 语义一致;隐私页只陈述已核实事实(唯一网络行为 = veil 引擎 CSS 代理,见 `src/tools/veil/background/main.js` 的 `nv-engine-fetch-css`)。

- [ ] **Step 4: Commit**

```bash
git add docs/store/listing.zh.md docs/privacy.zh.md
git commit -m "docs(m2): 商店文案单源(listing.zh.md)+ 隐私政策页(仓内,GitHub 链接)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 商店截图与小宣传图(真实捕获 + 板合成)

**Files:**
- Modify: `scripts/serve-fixtures.mjs`(ROOT 支持目录参数)
- Create: `docs/store/boards/mock-chrome.js`(initScript 注入的 chrome 替身)
- Create: `docs/store/boards/board-s3.html`(popup 合成板)
- Create: `docs/store/boards/board-promo.html`(440×280 宣传图板)
- Create: `docs/store/boards/board-compare.html`(可选:夜幕前后对比板,用户真机素材)
- Modify: `.gitignore`(加 `docs/store/assets/raw/`)
- Output(controller 实拍产出): `docs/store/assets/s1-options-veil.png`、`s2-options-pace.png`、`s3-popup.png`、`s4-general.png`、`promo-440x280.png`(命名与 Task 3 清单锁定一致)

**Interfaces:**
- Consumes: Task 1 的 pace popup http 存活(popup.html 可直接 http 打开);Task 2 的 `npm run zip`(产出新鲜 `extension/`)。
- Produces: Task 3 清单锁定的 5 个 PNG。

**分工:** Steps 1–3 = 实现者(代码/板/serve 改造,提交);Steps 4–8 = 控制器(chrome-devtools 实拍 + 目检 + 资产提交)。实现者不碰浏览器。

- [ ] **Step 1: serve-fixtures 支持根目录参数**

`scripts/serve-fixtures.mjs` 的 `const ROOT = path.resolve('tests/fixtures');` 改:

```js
const ROOT = path.resolve(process.argv[2] ?? 'tests/fixtures'); // 默认不变;可传 extension/ 服务构建产物
```

- [ ] **Step 2: 写 mock-chrome.js**

`docs/store/boards/mock-chrome.js` 新建(SEEDS 中 `nightveil.settings` 的键名**必须先读 `src/tools/veil/shared/settings.js` 的 DEFAULT_SETTINGS/常量照抄结构**再叠加示例值——站点名单字段名以真实 schema 为准,不得凭猜;`MANIFEST.commands` 从 `extension/manifest.json` 原样拷贝 8 条命令对象):

```js
// docs/store/boards/mock-chrome.js — 商店截图捕获用 chrome 替身(navigate_page initScript 注入)
// 真话边界:只提供内存版 storage.local / runtime.getManifest / tabs.query;
// UI 渲染、默认值回填、写入链全部走真实代码路径。种子经 URL ?seed=<name> 选择。
(() => {
  const MANIFEST = {
    version: '1.0.0', name: 'Octopus',
    description: '工具的瑞士军刀:暗色模式与视频倍速,更多工具持续加入。',
    commands: { /* 从 extension/manifest.json 的 commands 原样拷贝 */ },
  };
  const SEEDS = {
    veil: { /* nightveil.settings:DEFAULT_SETTINGS 拷贝 + 站点名单 3 例 */ },
    pace: { 'vpa.settings': { pace: 1.5, hold: true, heldPace: 1.5, introSkip: 30, skipOn: true }, 'oct.shell': { activeWing: 'pace' } },
    gen: { 'oct.shell': { activeWing: 'gen' }, 'nightveil.settings': { ui: { fontSize: 15 } } },
    popup: { 'vpa.settings': { pace: 1.5, hold: true, heldPace: 1.5, introSkip: 30, skipOn: true, autoAdvance: false }, 'oct.shell': { activeTool: 'pace' } },
  };
  const store = new Map(Object.entries(SEEDS[new URLSearchParams(location.search).get('seed') ?? 'veil'] ?? {}));
  const area = {
    get(keys, cb) {
      const out = {};
      if (keys === null || keys === undefined) { for (const [k, v] of store) out[k] = v; }
      else { for (const k of Array.isArray(keys) ? keys : [keys]) if (store.has(k)) out[k] = store.get(k); }
      setTimeout(() => cb(out), 0);
    },
    set(obj, cb) { for (const [k, v] of Object.entries(obj)) store.set(k, v); setTimeout(() => cb && cb(), 0); },
    remove(keys, cb) { for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k); setTimeout(() => cb && cb(), 0); },
    onChanged: { addListener() {}, removeListener() {} },
  };
  globalThis.chrome = {
    storage: { local: area },
    runtime: { getManifest: () => MANIFEST, getURL: (p) => p },
    tabs: { query: async () => [] },
  };
})();
```

注:gen 种子里 `nightveil.settings.ui.fontSize` 键路径已核实(veil 深合并语义,`options-general.js` 同写法);veil 种子整体结构以 settings.js 为准。

- [ ] **Step 3: 写合成板**

`docs/store/boards/board-s3.html`(popup 实拍帧 → 1280×800):

```html
<!doctype html>
<!-- popup 合成板:raw/popup-pace.png 实拍帧浮于夜与金底板。仅布景,不仿冒 UI。 -->
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
  body {
    background: radial-gradient(1100px 700px at 30% 20%, #202634, #12141c 70%);
    display: flex; align-items: center; justify-content: flex-end;
    font-family: 'Noto Serif SC', 'Songti SC', serif;
  }
  img.shot { height: 640px; margin-right: 120px; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,.55), 0 0 0 1px #2a3040; }
  aside { position: absolute; left: 120px; top: 50%; transform: translateY(-50%); color: #e8ebf4; }
  aside h1 { font-size: 64px; font-weight: 600; margin: 0 0 18px; letter-spacing: .04em; }
  aside h1 b { color: #e3c987; font-weight: 600; }
  aside p { font-size: 26px; color: #9aa3b8; margin: 0 0 10px; }
  aside hr { border: 0; border-top: 1px solid #2a3040; width: 220px; margin: 26px 0; }
</style>
<body>
  <aside>
    <h1>Octo<b>pus</b></h1>
    <p>暗色模式 · 视频倍速</p>
    <hr>
    <p>任意网站就地生效,设置只存本机</p>
  </aside>
  <img class="shot" src="../assets/raw/popup-pace.png" alt="">
</body>
```

`docs/store/boards/board-promo.html`:

```html
<!doctype html>
<!-- 小宣传图板 440×280:夜盘 + 章鱼 v5(toolbar/128.png 实图)+ 字标 -->
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: 440px; height: 280px; overflow: hidden; }
  body {
    background: radial-gradient(420px 300px at 24% 18%, #232b3f, #1B2233 72%);
    display: flex; align-items: center; gap: 26px; padding-left: 44px; box-sizing: border-box;
    font-family: 'Noto Serif SC', 'Songti SC', serif; color: #e8ebf4;
  }
  img { width: 128px; height: 128px; border-radius: 28px; box-shadow: 0 10px 34px rgba(0,0,0,.5); }
  h1 { font-size: 52px; margin: 0 0 8px; font-weight: 600; letter-spacing: .04em; }
  h1 b { color: #e3c987; font-weight: 600; }
  p { font-size: 17px; color: #9aa3b8; margin: 0; }
</style>
<body>
  <img src="../../../public/icons/toolbar/128.png" alt="">
  <div>
    <h1>Octo<b>pus</b></h1>
    <p>暗色模式 · 视频倍速</p>
  </div>
</body>
```

`docs/store/boards/board-compare.html`(可选板,用户真机素材到位才用):

```html
<!doctype html>
<!-- 夜幕前后对比板:两帧真机截图并排(素材由用户提供,文件名 raw/veil-off.png / raw/veil-on.png) -->
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; background: #12141c; }
  body { display: flex; gap: 2px; font-family: 'Noto Serif SC', 'Songti SC', serif; }
  figure { margin: 0; flex: 1; position: relative; }
  img { width: 100%; height: 800px; object-fit: cover; object-position: top; display: block; }
  figcaption {
    position: absolute; left: 24px; bottom: 24px; background: rgba(18,20,28,.82);
    color: #e8ebf4; font-size: 22px; padding: 8px 18px; border-radius: 8px;
    border: 1px solid #2a3040;
  }
  figure.on figcaption { color: #e3c987; }
</style>
<body>
  <figure><img src="../assets/raw/veil-off.png" alt=""><figcaption>关</figcaption></figure>
  <figure class="on"><img src="../assets/raw/veil-on.png" alt=""><figcaption>开 · Octopus 夜幕</figcaption></figure>
</body>
```

`.gitignore` 追加一行:`docs/store/assets/raw/`。建目录 `docs/store/assets/raw/`(放 `.gitkeep`?否——raw 整目录已忽略,捕获时 mkdir 即可)。

- [ ] **Step 4: 实现者提交代码件**

Run: `npm test`(serve 改造无测试面,全量防回归)→ 绿
```bash
git add scripts/serve-fixtures.mjs docs/store/boards/ .gitignore
git commit -m "feat(m2): 截图捕获件 — serve 根参数/mock-chrome 替身/合成板(资产实拍由控制器执行)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [ ] **Step 5(控制器): 起服与捕获准备**

```bash
npm run zip && mkdir -p docs/store/assets/raw
FIXTURES_PORT=8743 node scripts/serve-fixtures.mjs extension &
```
mock-chrome.js 全文作为 `navigate_page` 的 `initScript` 传入(每次导航都注入)。

- [ ] **Step 6(控制器): 四张 1280×800 + 宣传图**

每张:`new_page`(URL 带 `?seed=…`,initScript=mock)→ `resize_page` 1280×800 DPR 1 → `wait_for` 页面特征字(如「数据」)→ `take_screenshot` 存目标路径:
1. `http://localhost:8743/options.html?seed=veil` → `docs/store/assets/s1-options-veil.png`
2. `http://localhost:8743/options.html?seed=pace` → `s2-options-pace.png`
3. `http://localhost:8743/options.html?seed=gen` → `s4-general.png`
4. popup:`http://localhost:8743/popup.html?seed=popup`,视口宽 = popup 实际定宽(先 grep `public/popup.html` 的 body/popup 定宽,取同值;高 ≤700)→ 截 `assets/raw/popup-pace.png`;再开 `file://…/docs/store/boards/board-s3.html`(无需 mock)1280×800 → 截 `s3-popup.png`
5. 宣传图:`file://…/docs/store/boards/board-promo.html` 440×280 → `promo-440x280.png`

- [ ] **Step 7(控制器): 尺寸钉子 + 目检**

```bash
sips -g pixelWidth -g pixelHeight docs/store/assets/*.png
```
Expected: s1–s4 = 1280×800;promo = 440×280。逐一 `Read` PNG 目检:无预览态半透明(完整模式)、无错翼、无滚动条残影、字体正常渲染。

- [ ] **Step 8(控制器): 资产提交**

```bash
git add docs/store/assets/*.png
git commit -m "assets(m2): 商店截图×4(1280×800)+ 小宣传图(440×280)— mock-chrome 完整模式实拍

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: 收尾门 — 全量验证 + MILESTONES + 真机过目清单

**Files:**
- Modify: `docs/MILESTONES.md`(M2 节重写)
- Modify: 仓库根 `.superpowers/sdd/progress.md`(台账,执行期逐任务记)

**Interfaces:**
- Consumes: Tasks 1–4 全部产出。
- Produces: 用户真机过目清单;M2 待关账状态(勾选除验收项)。

- [ ] **Step 1: 全量门**

```bash
npm test && npm run zip && unzip -l dist/octopus-1.0.0.zip | head -20
```
Expected: 测试全绿(≈319);zip 绿且列表干净。残留 grep:`grep -rn "alert('" src/` → 0(文案全进 SS);`grep -n 'view is-on' public/options.html` → 0。

- [ ] **Step 2: http 挂载目检(控制器)**

serve 起 `extension/`,开 `options.html`:三翼可切、**重开页面首帧即记忆翼(FOUC 消失)**、数据区两行 hint(含隐私提示);开 `popup.html`:pace 面板默认值渲染不白屏(`data-preview` 半透明为预期)。

- [ ] **Step 3: MILESTONES M2 节重写**

```markdown
## M2 上架准备
- [x] 质量地板波(M1 种子清偿:导入逐键卫生/NaN 入界/lastError/空导出文案/导出隐私提示/翼首帧 FOUC;pace popup http 存活)
- [x] 版本 1.0.0 + `npm run zip` 打包链(包根 manifest/版本三处同步/钉子测试)
- [x] 商店文案单源 listing.zh.md + 隐私政策页(仓内 docs/privacy.zh.md,GitHub 链接)
- [x] 商店截图 ×4 + 小宣传图(mock-chrome 完整模式实拍,1280×800/440×280)
- [ ] 验收:全量门 + 用户真机过目(zip 解包加载/导入卫生手测/FOUC 复验/商店图目检;通过后 push 关账)
- 吸收取代 video-acc 的 store-prep 备忘(其 MILESTONES 末节三件事:版本号决策 1.0.0 ✓/商店素材 ✓/打磨→种子并入首波 ✓)
```

- [ ] **Step 4: Commit + 交棒**

```bash
git add docs/MILESTONES.md
git commit -m "docs(m2): 收尾 — MILESTONES 勾账(验收项待真机过目)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

真机过目清单(交用户):
1. `npm run zip` → 解包 `dist/octopus-1.0.0.zip` → chrome://extensions「加载已解压」指向解包目录:无报错、卡片版本 1.0.0
2. 导入卫生:手造脏 JSON(`vpa.settings` 的 `pace:"fast"` + `oct.shell` 的 `activeWing:"evil"` + 正常 `nightveil.settings`)导入 → 夜幕生效、脏键被丢、无报错;全新导出→再导入 → 提示「没有可导入的数据」
3. FOUC:停在倍速翼关闭 options → 重开 → 首帧即倍速翼
4. 商店图目检 `docs/store/assets/` 5 张(内容/构图/无异物)
5. (可选)真机截夜幕关/开两帧放入 `docs/store/assets/raw/veil-off.png`/`veil-on.png` → 补拍对比版 `s4`
6. 隐私页链接可达:https://github.com/zz984230/chromeStore/blob/develop/octopus/docs/privacy.zh.md

---

## Self-Review 记录

- 覆盖:spec 五件 ↔ Task 1(①)/Task 2(②)/Task 3(③)/Task 4(④)/Task 5(⑤)一一对应;四项用户裁定全部落(Task 1 首波、Task 2 版本、Task 3 仅中文+仓内隐私页、Task 4 真捕获)。
- 契约一致性:parseImportFile 新契约在 Step 1 测试与 Step 6 实现一致(`null`/`{}`/丢键);stepSkip 守卫测试三例与实现推演一致(NaN→5、undefined→5、'x'-5→0);Task 3 锁定的资产文件名 = Task 4 产出路径。
- 事实核验:options.html:311 硬编码 `is-on`、pace popup main.js:13 无守卫、pace loadSettings 无读侧夹取、store.js IDS/WINGS 未导出、.gitignore 现两行——均已读源确认。
- 已知留白(有意):mock-chrome 的 veil 种子与 MANIFEST.commands 标注「照真实源抄」——数据在 `src/tools/veil/shared/settings.js` 与 `extension/manifest.json`,实现时读取填入,非逻辑留白。
