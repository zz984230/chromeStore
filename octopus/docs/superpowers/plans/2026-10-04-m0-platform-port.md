# Octopus M0(平台与移植)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 nightveil 与 video-acc 以「壳 + 契约 + 工具」平台架构合并为 octopus:manifest 构建期装配、两工具内脏原样移植、297± 已废项测试全绿。

**Architecture:** 三层——`src/shell/`(唯一 SW/popup/options 入口、manifest 装配输入、壳存储、壳文案)、`src/tools/{veil,pace}/`(各工具完整内部树原样搬入,相对导入零改写)、`scripts/manifest.mjs`(纯装配函数)。工具 SW 片件是自挂载副作用模块,壳 bootstrap 只 import。详见 `octopus/CONTEXT.md`、`docs/adr/0001-0003`。

**Tech Stack:** Chrome MV3、esbuild(唯一依赖)、node --test(Node ≥20)、零依赖 PNG 图标生成器。

## Global Constraints

- 执行前置门槛:nightveil M3+迭代②已关账并推送(develop)。本计划的所有 commit 落在 chromeStore monorepo 的 develop 分支。
- 工具代码标识符**一个不改**:`nightveil.settings`、`vpa.settings` 存储键,`nv-` 类名前缀,`paceMath` 等函数名,消息名 `nv-engine-fetch-css`/`pace.apply`。
- 用户新增存储命名空间仅一个:`oct.shell`(壳)。
- 文案中文;文案单源纪律:壳文案在 `src/shell/strings.js`,veil 文案在 `tools/veil/shared/strings.js`。pace 文案收纳**推迟到 M1**(本计划不做,理由:无 M0 消费者,保移植纯度)。
- 目录纪律:根级产物(background.js/popup.js/options.js/manifest.json)归壳;`tools/` 子树归工具。禁止工具互相 import;壳不得 import 工具内部模块(只经 `src/tools/registry.js` 与各 `tool.js` 契约)。
- 测试硬门槛:全量绿;统一 `node --test --test-isolation=none`,若跨树互踩则退 `test:shell/test:veil/test:pace` 分包,不修测试迁就统一。
- 提交信息:`feat(m0):`/`test(m0):`/`docs(m0):`/`chore(m0):` 前缀,末尾 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 每个任务收尾:跑该任务的验证命令并核对预期输出,然后 commit。绝不提交未验证的改动。

## 源事实(实现者必读)

- nightveil 源:`dark-mode/nightveil/src/{background,content,options,popup,shared}/`(25 文件,4618 行);静态:`dark-mode/nightveil/public/`(manifest.json、popup.html、options.html、nv-shadow-hook.js、icons/{toolbar,dark,light}/{16,32,48,64,128}.png);测试:`dark-mode/nightveil/tests/{unit/*.test.mjs,fixtures/}`;脚本:`scripts/{build,gen-icons,serve-fixtures}.mjs`。
- video-acc 源:`video-acc/src/{background,content,popup,shared}/`(13 文件);静态:`video-acc/public/`(manifest.json、popup.html、popup.css、content.css、icons/{16,32,48,128}.png);测试:`video-acc/tests/unit/*.test.mjs`(11 文件)。
- NV 测试导入形状:`import ... from '../../src/shared/actions.js'` 等(测试目录深度两级)。
- NV popup.html 挂点 id:`pp-dusk-host/pp-seats/pp-site-row/pp-ct/pp-foot`,body 定宽 360px,样式内联 `<style>`。
- VA popup.html 挂点 id:`pace-figure/pace-dial/pace-chips/pace-note/app-version/hold-switch/hold-label/skip-intro/skip-outro/skip-switch/skip-label/advance-switch/advance-label/advance-now`;`popup.css` 首条规则 `body { width: 300px; ... }`;`:root` 定义 `--glow` 等变量。
- NV `src/shared/icons.js` 的 `iconPathsFor(state)` 返回 `icons/${dark|light}/{16,32,48,64}.png`——octopus 图标目录保持同名三盘,该函数零改动。
- NV `engine.js:653` 是 `nv-shadow-hook.js` 的唯一 `getURL` 引用。
- NV `STRINGS.extensionName/extensionDescription` 只被 `strings-source.test.mjs` 消费,运行时 src 零引用(可安全删除)。
- VA 的 SW 是 `wireBackground()` 自调用模块;NV 的 SW 是顶层副作用模块——两者都可直接被壳 import。
- 两族消息互不相交:NV 仅 `nv-engine-fetch-css`(content→SW);VA 是 `{vpa: TYPE}` 页内协议(popup↔content,不经 SW)。M0 不建路由。

---

### Task 1: 脚手架

**Files:**
- Create: `octopus/package.json`、`octopus/.gitignore`

**Interfaces:**
- Produces: npm 工程,后续任务在此目录内工作(`cd octopus`)。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "octopus",
  "private": true,
  "version": "0.1.0",
  "description": "工具的瑞士军刀:一个扩展容纳多个工具。",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "node scripts/build.mjs",
    "watch": "node scripts/build.mjs --watch",
    "icons": "node scripts/gen-icons.mjs",
    "fixtures": "node scripts/serve-fixtures.mjs",
    "test": "node --test --test-isolation=none"
  },
  "devDependencies": { "esbuild": "^0.25.0" }
}
```

- [ ] **Step 2: 写 .gitignore**

```
node_modules/
extension/
```

- [ ] **Step 3: 安装并验证**

Run: `cd octopus && npm install && npm test`
Expected: `node --test` 报 "no test files found" 类退出码——此时无测试属正常,记录实际输出;`ls node_modules/.bin/esbuild` 存在。

- [ ] **Step 4: Commit**

```bash
git add octopus/package.json octopus/.gitignore octopus/package-lock.json
git commit -m "chore(m0): octopus 脚手架 — npm 工程 esbuild 单依赖"
```

---

### Task 2: veil 源与测试移植

**Files:**
- Create: `octopus/src/tools/veil/`(整树)、`octopus/tests/veil/`(NV unit 测试减 3 个文件)、`octopus/public/tools/veil/nv-shadow-hook.js`
- 来源: `dark-mode/nightveil/src/`、`dark-mode/nightveil/tests/unit/`、`dark-mode/nightveil/public/nv-shadow-hook.js`

**Interfaces:**
- Produces: `src/tools/veil/{background,content,options,popup,shared}/` 内部相对导入不变;测试从 `tests/veil/*.test.mjs` 以 `../../src/tools/veil/...` 导入。
- 本任务**不拷**:`build.test.mjs`(Task 6)、`server.test.mjs`(Task 11)、`strings-source.test.mjs`(Task 10 重写为壳版)。

- [ ] **Step 1: 拷源码树**

```bash
cd octopus
mkdir -p src/tools public/tools/veil tests/veil
cp -R ../dark-mode/nightveil/src/background ../dark-mode/nightveil/src/content ../dark-mode/nightveil/src/options ../dark-mode/nightveil/src/popup ../dark-mode/nightveil/src/shared src/tools/veil/
cp ../dark-mode/nightveil/public/nv-shadow-hook.js public/tools/veil/
```

- [ ] **Step 2: 拷测试(排除 3 文件)并改写导入路径**

```bash
for f in ../dark-mode/nightveil/tests/unit/*.test.mjs; do
  b=$(basename "$f")
  [ "$b" = build.test.mjs ] && continue
  [ "$b" = server.test.mjs ] && continue
  [ "$b" = strings-source.test.mjs ] && continue
  cp "$f" tests/veil/
done
sed -i '' -e "s#src/shared/#src/tools/veil/shared/#g" -e "s#src/content/#src/tools/veil/content/#g" -e "s#src/background/#src/tools/veil/background/#g" -e "s#src/popup/#src/tools/veil/popup/#g" -e "s#src/options/#src/tools/veil/options/#g" tests/veil/*.test.mjs
```

- [ ] **Step 3: 改 shadow-hook 资源路径(唯一运行时路径改动)**

编辑 `src/tools/veil/content/engine/engine.js:653`:

```js
  script.src = chrome.runtime.getURL('tools/veil/nv-shadow-hook.js');
```

- [ ] **Step 4: 跑移植测试并记录基线**

Run: `node --test --test-isolation=none tests/veil`
Expected: 全绿。记录测试数(应 ≈ 224 减去被排除文件的测试数;把实际数与排除清单写进 commit message)。

- [ ] **Step 5: Commit**

```bash
git add octopus/src/tools/veil octopus/tests/veil octopus/public/tools/veil
git commit -m "feat(m0): veil 移植 — 整树落位 tools/veil,导入零改写,shadow-hook 路径随 WAR 迁移"
```

---

### Task 3: pace 源与测试移植

**Files:**
- Create: `octopus/src/tools/pace/`(整树)、`octopus/tests/pace/`(VA 测试减 1 文件)、`octopus/public/tools/pace/content.css`
- 来源: `video-acc/src/`、`video-acc/tests/unit/`、`video-acc/public/content.css`

**Interfaces:**
- Produces: `src/tools/pace/{background,content,popup,shared}/`。
- 本任务**不拷**:`gen-icons.test.mjs`(Task 7 以壳版重写)。

- [ ] **Step 1: 拷源码树与资产**

```bash
cd octopus
cp -R ../video-acc/src/background ../video-acc/src/content ../video-acc/src/popup ../video-acc/src/shared src/tools/pace/
mkdir -p public/tools/pace tests/pace
cp ../video-acc/public/content.css public/tools/pace/
```

- [ ] **Step 2: 拷测试(排除 gen-icons)并改写导入路径**

```bash
for f in ../video-acc/tests/unit/*.test.mjs; do
  b=$(basename "$f"); [ "$b" = gen-icons.test.mjs ] && continue
  cp "$f" tests/pace/
done
sed -i '' -e "s#src/shared/#src/tools/pace/shared/#g" -e "s#src/content/#src/tools/pace/content/#g" -e "s#src/background/#src/tools/pace/background/#g" -e "s#src/popup/#src/tools/pace/popup/#g" tests/pace/*.test.mjs
```

- [ ] **Step 3: 跑移植测试并记录基线**

Run: `node --test --test-isolation=none tests/pace`
Expected: 全绿(≈73 减 gen-icons 的 1)。记录实际数。

- [ ] **Step 4: Commit**

```bash
git add octopus/src/tools/pace octopus/tests/pace octopus/public/tools/pace
git commit -m "feat(m0): pace 移植 — 整树落位 tools/pace,content.css 随注入 entry 迁移"
```

---

### Task 4: 工具契约与注册表

**Files:**
- Create: `src/tools/veil/tool.js`、`src/tools/pace/tool.js`、`src/tools/registry.js`
- Test: `tests/shell/registry.test.mjs`

**Interfaces:**
- Produces: `TOOLS: Array<ToolContract>`、`toolById(id)`。ToolContract 形状:`{ id: string, manifest: { permissions: string[], optionalPermissions: string[], contentScripts: object[], webAccessibleResources: object[], commands: object } }`。Task 5 的 `assembleManifest(tools, { version })` 与 Task 6 的 build 都消费 `TOOLS`;Task 9 的 popup 壳消费 `toolById`。

- [ ] **Step 1: 写失败测试**

```js
// tests/shell/registry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolById } from '../../src/tools/registry.js';

test('注册表含 veil 与 pace,id 唯一且契约字段齐全', () => {
  const ids = TOOLS.map((t) => t.id);
  assert.deepEqual([...ids].sort(), ['pace', 'veil']);
  assert.equal(new Set(ids).size, ids.length, 'id 必须唯一');
  for (const t of TOOLS) {
    for (const key of ['permissions', 'optionalPermissions', 'contentScripts', 'webAccessibleResources', 'commands']) {
      assert.ok(Array.isArray(t.manifest[key]) || typeof t.manifest[key] === 'object', `${t.id}.${key} 必须声明`);
    }
    assert.ok(t.manifest.contentScripts.length >= 1, `${t.id} 必须有 content 注入`);
  }
  assert.equal(toolById('veil').id, 'veil');
  assert.equal(toolById('nope'), null);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/shell/registry.test.mjs`
Expected: FAIL — Cannot find module '../../src/tools/registry.js'

- [ ] **Step 3: 写契约与注册表**

```js
// src/tools/veil/tool.js — veil 工具契约(ADR-0002:manifest 构建期装配的输入)
export const tool = {
  id: 'veil',
  manifest: {
    permissions: ['contextMenus'],
    optionalPermissions: ['alarms'],
    contentScripts: [{
      matches: ['<all_urls>'],
      js: ['tools/veil/content.js'],
      run_at: 'document_start',
      all_frames: true,
      match_about_blank: true,
    }],
    webAccessibleResources: [{
      resources: ['tools/veil/nv-shadow-hook.js'],
      matches: ['<all_urls>'],
    }],
    commands: {},
  },
};
```

```js
// src/tools/pace/tool.js — pace 工具契约。permissions 留空:activeTab 经 grep 实证
// 为冗余(已有 <all_urls> host_permissions + 静态注入),Task 6 有防回归断言。
export const tool = {
  id: 'pace',
  manifest: {
    permissions: [],
    optionalPermissions: [],
    contentScripts: [{
      matches: ['<all_urls>'],
      js: ['tools/pace/content.js'],
      css: ['tools/pace/content.css'],
      run_at: 'document_idle',
      all_frames: true,
    }],
    webAccessibleResources: [],
    commands: {
      'pace-up': { description: '加档（步进 0.25×）', suggested_key: { default: 'Alt+Period' } },
      'pace-down': { description: '减档（步进 0.25×）', suggested_key: { default: 'Alt+Comma' } },
      'pace-normal': { description: '回正到 1×', suggested_key: { default: 'Alt+0' } },
      'hold-toggle': { description: '切换保持（记忆当前档位并自动套用到新视频）', suggested_key: { default: 'Alt+L' } },
      'intro-minus': { description: '片头跳过 -5 秒（调到大于 0 自动启用）' },
      'intro-plus': { description: '片头跳过 +5 秒（调到大于 0 自动启用）' },
      'advance-now': { description: '立即续播（手动切下一个视频，不受总开关限制）' },
    },
  },
};
```

```js
// src/tools/registry.js — 工具注册表:新增工具 = 加目录 + 这里一行(ADR-0002)
import { tool as veilTool } from './veil/tool.js';
import { tool as paceTool } from './pace/tool.js';

export const TOOLS = [veilTool, paceTool];
export const toolById = (id) => TOOLS.find((t) => t.id === id) ?? null;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/shell/registry.test.mjs`
Expected: PASS 1

- [ ] **Step 5: Commit**

```bash
git add octopus/src/tools/veil/tool.js octopus/src/tools/pace/tool.js octopus/src/tools/registry.js octopus/tests/shell/registry.test.mjs
git commit -m "feat(m0): 工具契约与注册表 — 声明式 manifest 增量,activeTab 实证冗余后不申报"
```

---

### Task 5: manifest 装配器(纯函数,TDD)

**Files:**
- Create: `src/shell/strings.js`、`scripts/manifest.mjs`
- Test: `tests/shell/manifest.test.mjs`

**Interfaces:**
- Consumes: `TOOLS`(Task 4)。
- Produces: `assembleManifest(tools, { version }) -> object`;`SHELL_STRINGS = { extensionName, extensionDescription, popupTabVeil, popupTabPace, optionsHeading, generalNavLabel }`。

- [ ] **Step 1: 写壳文案模块**

```js
// src/shell/strings.js — 壳文案单源(工具文案在各工具 strings 内)
export const SHELL_STRINGS = Object.freeze({
  extensionName: 'Octopus',
  extensionDescription: '工具的瑞士军刀：暗色模式与视频倍速，更多工具持续加入。',
  popupTabVeil: '暗色模式',
  popupTabPace: '视频倍速',
  optionsHeading: 'Octopus 设置',
  generalNavLabel: '通用',
});
```

- [ ] **Step 2: 写失败测试**

```js
// tests/shell/manifest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleManifest } from '../../scripts/manifest.mjs';
import { TOOLS } from '../../src/tools/registry.js';
import { SHELL_STRINGS } from '../../src/shell/strings.js';

const m = assembleManifest(TOOLS, { version: '0.1.0' });

test('基座字段:名称/描述来自壳文案,版本透传', () => {
  assert.equal(m.manifest_version, 3);
  assert.equal(m.name, SHELL_STRINGS.extensionName);
  assert.equal(m.description, SHELL_STRINGS.extensionDescription);
  assert.equal(m.version, '0.1.0');
  assert.deepEqual(m.background, { service_worker: 'background.js' });
  assert.equal(m.options_ui.page, 'options.html');
  assert.equal(m.action.default_popup, 'popup.html');
});

test('权限并集去重且精确:storage+contextMenus,可选 alarms,无 activeTab', () => {
  assert.deepEqual(m.permissions, ['storage', 'contextMenus']);
  assert.deepEqual(m.optional_permissions, ['alarms']);
});

test('content_scripts 两条 entry 按注册顺序,逐字段保真', () => {
  assert.equal(m.content_scripts.length, 2);
  const [veil, pace] = m.content_scripts;
  assert.equal(veil.js[0], 'tools/veil/content.js');
  assert.equal(veil.run_at, 'document_start');
  assert.equal(veil.match_about_blank, true);
  assert.equal(veil.all_frames, true);
  assert.equal(pace.js[0], 'tools/pace/content.js');
  assert.deepEqual(pace.css, ['tools/pace/content.css']);
  assert.equal(pace.run_at, 'document_idle');
  assert.equal(pace.match_about_blank, undefined);
});

test('commands 8 条合并,WAR 仅 veil 一项', () => {
  assert.equal(Object.keys(m.commands).length, 8);
  assert.equal(m.commands['hold-toggle'].suggested_key.default, 'Alt+L');
  assert.equal(m.web_accessible_resources.length, 1);
  assert.deepEqual(m.web_accessible_resources[0].resources, ['tools/veil/nv-shadow-hook.js']);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test tests/shell/manifest.test.mjs`
Expected: FAIL — Cannot find module '../../scripts/manifest.mjs'

- [ ] **Step 4: 写装配器**

```js
// scripts/manifest.mjs — 纯装配:壳基座 + 工具增量 → manifest 对象(ADR-0002)
import { SHELL_STRINGS } from '../src/shell/strings.js';

export function assembleManifest(tools, { version }) {
  const permissions = new Set(['storage']); // 壳自身与两工具共用
  const optional = new Set();
  const contentScripts = [];
  const war = [];
  const commands = {};
  for (const t of tools) {
    const m = t.manifest ?? {};
    for (const p of m.permissions ?? []) permissions.add(p);
    for (const p of m.optionalPermissions ?? []) optional.add(p);
    contentScripts.push(...(m.contentScripts ?? []));
    war.push(...(m.webAccessibleResources ?? []));
    Object.assign(commands, m.commands ?? {});
  }
  const toolIcons = { 16: 'icons/toolbar/16.png', 32: 'icons/toolbar/32.png', 48: 'icons/toolbar/48.png', 128: 'icons/toolbar/128.png' };
  return {
    manifest_version: 3,
    name: SHELL_STRINGS.extensionName,
    version,
    description: SHELL_STRINGS.extensionDescription,
    author: 'zhaor121',
    icons: toolIcons,
    background: { service_worker: 'background.js' },
    action: {
      default_title: SHELL_STRINGS.extensionName,
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/toolbar/16.png', 32: 'icons/toolbar/32.png', 48: 'icons/toolbar/48.png', 64: 'icons/toolbar/64.png' },
    },
    options_ui: { open_in_tab: true, page: 'options.html' },
    permissions: [...permissions],
    optional_permissions: [...optional],
    content_scripts: contentScripts,
    web_accessible_resources: war,
    commands,
  };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test tests/shell/manifest.test.mjs`
Expected: PASS 4

- [ ] **Step 6: Commit**

```bash
git add octopus/src/shell/strings.js octopus/scripts/manifest.mjs octopus/tests/shell/manifest.test.mjs
git commit -m "feat(m0): manifest 装配器 — 壳基座+工具增量纯函数,版本号从 package.json 单源"
```

---

### Task 6: 构建集成与 activeTab 实证

**Files:**
- Create: `octopus/scripts/build.mjs`、`octopus/tests/shell/build.test.mjs`(由 NV `build.test.mjs` 改造)

**Interfaces:**
- Consumes: `TOOLS`、`assembleManifest`。
- Produces: `npm run build` → `extension/`(background.js、popup.js、options.js、tools/veil/content.js、tools/pace/content.js、manifest.json、public/ 全拷)。

- [ ] **Step 1: activeTag 冗余实证**

Run: `grep -rn "activeTab\|chrome.permissions" video-acc/src video-acc/tests | grep -v "host_permissions"`
Expected: 零命中(或仅注释)。若出现真实调用,停下升级到控制器裁决——pace 契约补 `'activeTab'` 并更新 Task 5 测试期望。

- [ ] **Step 2: 写 build.mjs**

```js
// scripts/build.mjs
// 打包 src/ 入口 → extension/,装配 manifest,public/ 原样拷入。
// --watch:重建 JS,public/ 变更重拷。
import { build, context } from 'esbuild';
import { cp, rm, readFile, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import process from 'node:process';
import { TOOLS } from '../src/tools/registry.js';
import { assembleManifest } from './manifest.mjs';

const WATCH = process.argv.includes('--watch');
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const OPTIONS = {
  entryPoints: {
    background: 'src/shell/background.js',
    popup: 'src/shell/popup.js',
    options: 'src/shell/options.js',
    'tools/veil/content': 'src/tools/veil/content/main.js',
    'tools/pace/content': 'src/tools/pace/content/main.js',
  },
  outdir: 'extension',
  bundle: true,
  format: 'iife',
  target: ['chrome120'],
  sourcemap: false,
  logLevel: 'info',
};

async function emitManifest() {
  await writeFile('extension/manifest.json', `${JSON.stringify(assembleManifest(TOOLS, { version }), null, 2)}\n`);
}

if (!WATCH) {
  await rm('extension', { recursive: true, force: true });
  await build(OPTIONS);
  await emitManifest();
  await cp('public', 'extension', { recursive: true });
} else {
  const ctx = await context(OPTIONS);
  await ctx.watch();
  await emitManifest();
  await cp('public', 'extension', { recursive: true });
  watch('public', { recursive: true }, () => {
    cp('public', 'extension', { recursive: true }).catch(() => {});
  });
  console.log('[octopus] watching src/ and public/ ...');
}
```

注意:此步引入的三个壳入口文件在 Task 9/10 才创建。本任务先建**占位不得提交**——改为:本任务先创建三个最小占位入口让 build 可跑,Task 9/10 替换为真实现:

```js
// src/shell/background.js(占位,Task 10 替换)
// src/shell/popup.js(占位,Task 9 替换)
// src/shell/options.js(占位,Task 10 替换)
```

占位内容一律一行注释 `// 占位 — Task N 替换`。

- [ ] **Step 3: 改造 build.test.mjs**

从 `dark-mode/nightveil/tests/build.test.mjs` 拷贝到 `tests/shell/build.test.mjs`,做如下改造(保留其余断言结构):
1. 导入路径里的 `../../src/...` 按工具落位改写(同 Task 2 sed 规则);
2. 产物路径断言:`extension/content.js` → `extension/tools/veil/content.js` 与 `extension/tools/pace/content.js`;popup/options/background 断言保持;
3. manifest 断言改为:读 `extension/manifest.json`,断言 `name === 'Octopus'`、`content_scripts.length === 2`、`permissions` 不含 `activeTab`、8 条 commands 在场;
4. 删除任何对 `public/manifest.json` 的读取(装配后不存在该文件)。

- [ ] **Step 4: 跑构建与测试**

Run: `npm run build && node --test tests/shell/build.test.mjs`
Expected: 构建输出 5 个 entry;测试 PASS;`ls extension/` 见 manifest.json、background.js、popup.js、options.js、tools/、public 资产。

- [ ] **Step 5: Commit**

```bash
git add octopus/scripts/build.mjs octopus/src/shell/background.js octopus/src/shell/popup.js octopus/src/shell/options.js octopus/tests/shell/build.test.mjs
git commit -m "feat(m0): 构建集成 — registry 驱动入口与 manifest 装配,activeTab 实证剪除"
```

---

### Task 7: 章鱼图标首切版

**Files:**
- Create: `octopus/scripts/gen-icons.mjs`(由 NV 版改造)、`octopus/tests/shell/gen-icons.test.mjs`

**Interfaces:**
- Produces: `public/icons/{toolbar,dark,light}/{16,32,48,64,128}.png`(15 文件)。目录名与 NV 一致 → `iconPathsFor` 零改动。

- [ ] **Step 1: 写失败测试(壳版,替代 VA 旧测)**

```js
// tests/shell/gen-icons.test.mjs — 三盘 × 五尺寸合法 PNG;深浅盘双色采样
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SETS = ['toolbar', 'dark', 'light'];
const SIZES = [16, 32, 48, 64, 128];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodeRgba(buf) {
  const size = buf.readUInt32BE(16);
  const idatAt = buf.indexOf(Buffer.from('IDAT'));
  const len = buf.readUInt32BE(idatAt - 4);
  const raw = inflateSync(buf.subarray(idatAt + 4, idatAt + 4 + len));
  const stride = size * 4;
  const at = (x, y) => raw.subarray(y * (stride + 1) + 1 + x * 4, y * (stride + 1) + 1 + x * 4 + 4);
  return { size, at };
}

test('章鱼三盘再生成:各盘各尺寸合法方形 PNG', () => {
  execFileSync(process.execPath, ['scripts/gen-icons.mjs']);
  for (const set of SETS) for (const size of SIZES) {
    const buf = readFileSync(`public/icons/${set}/${size}.png`);
    assert.deepEqual(buf.subarray(0, 8), PNG_SIGNATURE, `${set}/${size} PNG 魔数`);
    assert.equal(buf.readUInt32BE(16), size, `${set}/${size} IHDR 宽`);
    assert.equal(buf.readUInt32BE(20), size, `${set}/${size} IHDR 高`);
  }
});

test('深浅盘确实异色(同形换色机制的最小活体证明)', () => {
  const dark = decodeRgba(readFileSync('public/icons/dark/64.png'));
  const light = decodeRgba(readFileSync('public/icons/light/64.png'));
  assert.equal(dark.size, 64);
  const d = dark.at(8, 8), l = light.at(8, 8);
  assert.notDeepEqual(d, l, '深浅盘同坐标像素应不同色');
});
```

- [ ] **Step 2: 确认失败**

Run: `node --test tests/shell/gen-icons.test.mjs`
Expected: FAIL — 找不到 `scripts/gen-icons.mjs` 或图标文件缺失。

- [ ] **Step 3: 改造生成器**

```bash
cp ../dark-mode/nightveil/scripts/gen-icons.mjs scripts/gen-icons.mjs
```

改造点(保留 PNG 编码器、超采样栅格化骨架、盘 SETS 三组配色结构):
1. 输出注释与 console 标签改为 octopus;
2. 把月牙标记的覆盖率函数替换为章鱼标记(圆顶头 + 4 弧腿)。标记覆盖判定用如下纯函数(在标记坐标系 [-1,1]² 内,plate 绘制逻辑不动):

```js
// 章鱼标记覆盖率:圆顶头 + 四条弧腿。p 为标记坐标,s 为腿位相(0..3)。
function octopusMark(px, py) {
  // 头:上侧圆
  const headR = 0.42;
  const inHead = py <= 0.05 && px * px + (py - 0.05) * (py - 0.05) <= headR * headR;
  if (inHead) return true;
  // 四腿:从头部下缘向外的弧带
  const legY0 = 0.05, legY1 = 0.92;
  if (py < legY0 || py > legY1) return false;
  const t = (py - legY0) / (legY1 - legY0); // 0..1 沿腿
  const centers = [-0.66, -0.22, 0.22, 0.66];
  for (const cx of centers) {
    const sway = 0.10 * Math.sin(t * Math.PI * 1.5 + cx * 2); // 波浪裙边
    const dx = px - (cx + sway);
    const dy = (py - legY0);
    const halfW = 0.085 + 0.045 * (1 - t); // 腿根粗、梢细
    if (Math.abs(dx) <= halfW && dy <= legY1 - legY0) return true;
  }
  return false;
}
```

接线:在原「月牙内 = 标记色」的判定处,以归一化坐标调用 `octopusMark(nx, ny)`(nx/ny 为像素映射到 [-1,1] 的标记坐标系)作为标记色条件。配色 SETS 沿用原三组(深盘亮标记/浅盘暗标记/中性盘)。

3. VA 旧图标与 `public/icons/*.png` 平铺四张**不拷贝**(章鱼三盘取代)。

- [ ] **Step 4: 生成并验证**

Run: `node scripts/gen-icons.mjs && node --test tests/shell/gen-icons.test.mjs`
Expected: 15 文件生成;测试 PASS 2。

- [ ] **Step 5: 视觉过目(控制器)**

Run: `open public/icons/toolbar/128.png public/icons/dark/128.png public/icons/light/128.png`(或用 Read 工具查看图片)
Expected: 三盘可辨认「圆头+裙边」章鱼印象,深浅互反。不追求精修——M1 设计迭代负责。辨认度不足时只调 `octopusMark` 常量重生成,不动骨架。

- [ ] **Step 6: Commit**

```bash
git add octopus/scripts/gen-icons.mjs octopus/tests/shell/gen-icons.test.mjs octopus/public/icons
git commit -m "feat(m0): 章鱼图标首切版 — 三盘同形异色,月牙/双箭头降级为 popup 字形资产来源"
```

---

### Task 8: 壳存储(TDD)

**Files:**
- Create: `src/shell/store.js`
- Test: `tests/shell/store.test.mjs`

**Interfaces:**
- Produces: `loadShell(storage?) -> Promise<ShellState>`、`saveShellPatch(patch, storage?) -> Promise<ShellState>`,ShellState = `{ activeTool: 'veil' | 'pace' }`;键 `oct.shell`;DI 风格 storage 适配器(仿 VA store.js 的 MemoryStorage 测试模式)。Task 9 popup 壳消费。

- [ ] **Step 1: 写失败测试**

```js
// tests/shell/store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, saveShellPatch } from '../../src/shell/store.js';

function memoryStorage(initial = {}) {
  const state = { ...initial };
  return {
    get(key, cb) { cb({ [key]: state[key] }); },
    set(obj, cb) { Object.assign(state, obj); cb(); },
  };
}

test('默认态:activeTool = veil', async () => {
  assert.deepEqual(await loadShell(memoryStorage()), { activeTool: 'veil' });
});

test('补丁写入并回读;非法工具 id 拒绝', async () => {
  const storage = memoryStorage();
  await saveShellPatch({ activeTool: 'pace' }, storage);
  assert.deepEqual(await loadShell(storage), { activeTool: 'pace' });
  await assert.rejects(() => saveShellPatch({ activeTool: 'x' }, storage));
});

test('无 storage 时给出可捕获错误(popup 预览模式由调用方兜底)', async () => {
  await assert.rejects(() => loadShell(undefined));
});
```

- [ ] **Step 2: 确认失败**

Run: `node --test tests/shell/store.test.mjs`
Expected: FAIL — Cannot find module

- [ ] **Step 3: 实现**

```js
// src/shell/store.js — 壳存储:oct. 命名空间(Q4 当前工具持久化)。工具命名空间不经此。
const KEY = 'oct.shell';
const DEFAULTS = Object.freeze({ activeTool: 'veil' });
const IDS = new Set(['veil', 'pace']); // 与 registry 同步;M0 硬编码,第三个工具时改由 registry 注入

function merge(found) {
  const patch = found?.[KEY];
  return { ...DEFAULTS, ...(patch && typeof patch === 'object' ? patch : {}) };
}

export function loadShell(storage = globalThis.chrome?.storage?.local) {
  return new Promise((resolve, reject) => {
    if (!storage) { reject(new Error('chrome.storage.local unavailable')); return; }
    storage.get(KEY, (found) => resolve(merge(found)));
  });
}

export function saveShellPatch(patch, storage = globalThis.chrome?.storage?.local) {
  return new Promise((resolve, reject) => {
    if (!storage) { reject(new Error('chrome.storage.local unavailable')); return; }
    for (const k of Object.keys(patch ?? {})) if (!IDS.has(patch[k]) || k !== 'activeTool') {
      reject(new Error(`invalid shell patch: ${k}`)); return;
    }
    storage.get(KEY, (found) => {
      const next = merge(found);
      next.activeTool = patch.activeTool;
      storage.set({ [KEY]: next }, () => resolve(next));
    });
  });
}
```

- [ ] **Step 4: 确认通过**

Run: `node --test tests/shell/store.test.mjs`
Expected: PASS 3

- [ ] **Step 5: Commit**

```bash
git add octopus/src/shell/store.js octopus/tests/shell/store.test.mjs
git commit -m "feat(m0): 壳存储 — oct.shell 命名空间与当前工具持久化"
```

---

### Task 9: popup 壳(tab 条 + 双面板合页)

**Files:**
- Create: `public/popup.html`(合并页)、`src/shell/popup.js`(替换 Task 6 占位)
- 来源: `dark-mode/nightveil/public/popup.html`、`video-acc/public/popup.html` + `video-acc/public/popup.css`

**Interfaces:**
- Consumes: `loadShell/saveShellPatch`(Task 8)、两工具 popup main(副作用模块,已在 tools 树)。
- Produces: `extension/popup.js` 壳入口;DOM 约定 `#oct-tabs button[data-tool]`、`#oct-panel-veil`、`#oct-panel-pace`、`.is-hidden`。

- [ ] **Step 1: 合并 popup.html**

以 NV `public/popup.html` 为基底:
1. `<title>` 改 `Octopus`;`<html lang>` 保持;
2. NV 原 `<style>` 整体保留,但把其中 `body { ... }` 选择器改名 `.oct-body`(该块内 width:360px、底色、字体成为面板区样式);新增壳样式:

```css
#oct-tabs { display: flex; gap: 4px; padding: 8px 10px 0; }
#oct-tabs button { flex: 1; padding: 7px 4px; border: 0; border-radius: 8px 8px 0 0;
  background: transparent; color: var(--ink-2, #9aa0ae); font: inherit; font-size: 13px; cursor: pointer; }
#oct-tabs button.is-active { background: var(--bg); color: var(--ink, #f0f2f6); }
.oct-panel.is-hidden { display: none; }
```

3. body 结构改为:

```html
<body>
  <nav id="oct-tabs">
    <button type="button" data-tool="veil" class="is-active">暗色模式</button>
    <button type="button" data-tool="pace">视频倍速</button>
  </nav>
  <main class="oct-body">
    <section id="oct-panel-veil" class="oct-panel">
      <!-- NV 原 body 的全部子元素原样移入(pp-dusk-host 等五个挂点) -->
    </section>
    <section id="oct-panel-pace" class="oct-panel is-hidden">
      <!-- VA 原 body 的全部子元素原样移入(pace-* 等 14 个挂点),含 <style> 内联 VA popup.css(见 Step 2 调整) -->
    </section>
  </main>
</body>
```

4. VA 的 `popup.css` 内容内联进 pace section 前 `<style>`:删除 `body { width: 300px; ... }` 整条规则(定宽由壳 360px 承担);其余规则保留。随后核对变量冲突:

Run: `grep -oE '\-\-[a-z0-9-]+' public/popup.html | sort -u`
Expected: 输出 NV 与 VA 的 CSS 变量名并集。若同名不同值(重点查 `--glow`、`--bg`、`--ink`),把 VA 侧同名变量加 `vpa-` 前缀 sed 替换:

```bash
sed -i '' 's/var(--X)/var(--vpa-X)/g; s/--X:/--vpa-X:/g' public/popup.html  # X 为冲突变量名,逐个执行
```

- [ ] **Step 2: 写壳 popup.js(替换占位)**

```js
// src/shell/popup.js — 壳:tab 条 + 当前工具记忆(Q4);面板 DOM 由各工具 popup main 自挂
import { loadShell, saveShellPatch } from './store.js';
import '../tools/veil/popup/main.js';
import '../tools/pace/popup/main.js';

const buttons = [...document.querySelectorAll('#oct-tabs button')];
const panels = { veil: document.getElementById('oct-panel-veil'), pace: document.getElementById('oct-panel-pace') };

function show(id) {
  for (const b of buttons) b.classList.toggle('is-active', b.dataset.tool === id);
  for (const [tid, panel] of Object.entries(panels)) panel.classList.toggle('is-hidden', tid !== id);
}

for (const b of buttons) {
  b.addEventListener('click', () => {
    show(b.dataset.tool);
    saveShellPatch({ activeTool: b.dataset.tool }).catch(() => {}); // 预览模式写入失败即静默
  });
}

loadShell().then((s) => show(s.activeTool)).catch(() => show('veil'));
```

- [ ] **Step 3: 构建 + 冒烟**

Run: `npm run build && ls extension/ && node --test tests/shell`
Expected: 构建干净;壳测试全绿;`extension/popup.html` 含 `#oct-tabs` 与两个 panel section。

- [ ] **Step 4: Commit**

```bash
git add octopus/public/popup.html octopus/src/shell/popup.js
git commit -m "feat(m0): popup 壳 — tab 条双面板合页,当前工具持久化,两面板 DOM 原样"
```

---

### Task 10: SW 壳、options 壳与文案去品牌

**Files:**
- Create: `src/shell/background.js`、`src/shell/options.js`(替换占位)、`public/options.html`
- Modify: `src/tools/veil/shared/strings.js`、`tests/veil/strings-zh.test.mjs`
- Create: `tests/shell/strings-source.test.mjs`

**Interfaces:**
- Consumes: 两工具 SW/options 片件(副作用模块)。
- Produces: `extension/background.js`(挂载 veil+pace SW 片件)、`extension/options.html/options.js`。

- [ ] **Step 1: SW 壳(替换占位)**

```js
// src/shell/background.js — 壳 bootstrap:import 即挂载全部工具 SW 片件(ADR-0002)
import '../tools/veil/background/main.js';
import '../tools/pace/background/main.js';
```

- [ ] **Step 2: options 壳**

```js
// src/shell/options.js — M0:整页即 veil 设置;M1 侧边栏 IA 重设计接管
import '../tools/veil/options/main.js';
```

```bash
cp ../dark-mode/nightveil/public/options.html public/options.html
```

`public/options.html` 改两处:
1. `<title>夜幕</title>` → `<title>Octopus</title>`;
2. `<div class="wordmark" id="nv-wordmark">夜幕<small>NIGHTVEIL</small></div>` → `<div class="wordmark" id="nv-wordmark">Octopus<small>暗色模式</small></div>`。

- [ ] **Step 3: veil 文案去品牌(Q3:只动身份层文案)**

编辑 `src/tools/veil/shared/strings.js`:
1. 删除 `extensionName` 与 `extensionDescription` 两键(运行时零引用,grep 复核):

Run: `grep -rn "extensionName\|extensionDescription" src/ tests/ | grep -v shell/`
Expected: 仅 strings.js 自身与 strings-zh.test.mjs 的钉子。

2. `optionsHeading: '夜幕'` → `optionsHeading: '暗色模式'`;
3. `optionsNote: '拉上夜幕，让整个浏览器安静下来。'` → `optionsNote: '暗色模式工具的完整设置。'`;
4. 其余键(面板内部文案)一律不动。

同步修 `tests/veil/strings-zh.test.mjs` 中钉住上述被改键的期望值(只改这几个,其他钉子不动)。

- [ ] **Step 4: 壳版单源钉子测试**

```js
// tests/shell/strings-source.test.mjs — 装配 manifest ↔ 壳文案 ↔ 静态页 三方一致
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assembleManifest } from '../../scripts/manifest.mjs';
import { TOOLS } from '../../src/tools/registry.js';
import { SHELL_STRINGS } from '../../src/shell/strings.js';

test('装配 manifest 与壳文案一致;静态页 title 跟随', () => {
  const m = assembleManifest(TOOLS, { version: '0.1.0' });
  assert.equal(m.name, SHELL_STRINGS.extensionName);
  assert.equal(m.description, SHELL_STRINGS.extensionDescription);
  const optionsHtml = readFileSync(new URL('../../public/options.html', import.meta.url), 'utf8');
  const popupHtml = readFileSync(new URL('../../public/popup.html', import.meta.url), 'utf8');
  assert.ok(optionsHtml.includes(`<title>${SHELL_STRINGS.extensionName}</title>`));
  assert.ok(popupHtml.includes(`<title>${SHELL_STRINGS.extensionName}</title>`));
  assert.ok(popupHtml.includes(`>${SHELL_STRINGS.popupTabVeil}</button>`));
  assert.ok(popupHtml.includes(`>${SHELL_STRINGS.popupTabPace}</button>`));
});
```

- [ ] **Step 5: 全量验证**

Run: `npm run build && node --test --test-isolation=none tests/shell tests/veil tests/pace`
Expected: 构建干净(5 entry + manifest + public);全部测试绿(含改造后的 strings-zh 与新 strings-source)。

- [ ] **Step 6: Commit**

```bash
git add octopus/src/shell/background.js octopus/src/shell/options.js octopus/public/options.html octopus/src/tools/veil/shared/strings.js octopus/tests/veil/strings-zh.test.mjs octopus/tests/shell/strings-source.test.mjs
git commit -m "feat(m0): SW/options 壳与文案去品牌 — 身份层归 Octopus,面板文案不动"
```

---

### Task 11: fixtures 迁移

**Files:**
- Create: `scripts/serve-fixtures.mjs`、`tests/fixtures/`(整目录)、`tests/veil/server.test.mjs`
- 来源: `dark-mode/nightveil/scripts/serve-fixtures.mjs`、`dark-mode/nightveil/tests/fixtures/`、`dark-mode/nightveil/tests/unit/server.test.mjs`

- [ ] **Step 1: 拷贝**

```bash
cp ../dark-mode/nightveil/scripts/serve-fixtures.mjs scripts/
cp -R ../dark-mode/nightveil/tests/fixtures tests/
cp ../dark-mode/nightveil/tests/unit/server.test.mjs tests/veil/
```

- [ ] **Step 2: 改 server.test 导入路径**

先查其导入形状:`head -20 tests/veil/server.test.mjs`。按 Task 2 的 sed 规则改写 `src/` 引用;若它 import `../../scripts/serve-fixtures.mjs`,从 `tests/veil/` 出发该相对路径仍解析到 `octopus/scripts/serve-fixtures.mjs`,无需改。路径遍历安全断言(`/..%2fpackage.json` → 403)必须保留且仍然通过——它在守护新根。

- [ ] **Step 3: 验证**

Run: `node --test tests/veil/server.test.mjs`
Expected: PASS,含 403 安全断言。

- [ ] **Step 4: Commit**

```bash
git add octopus/scripts/serve-fixtures.mjs octopus/tests/fixtures octopus/tests/veil/server.test.mjs
git commit -m "test(m0): fixtures 与安全守卫迁移 — 路径遍历 403 钉子覆盖 octopus 根"
```

---

### Task 12: 测试合流对账

**Files:**
- Modify: `package.json`(仅当需要分包)、无源码改动

- [ ] **Step 1: 统一跑全量**

Run: `npm test`
Expected: 全绿。若跨树互踩(NV 与 VA 的 mock 在同进程冲突):

改 package.json:

```json
"test": "node --test tests/shell && node --test tests/veil && node --test tests/pace"
```

再跑 `npm test`,分包后必须全绿。**禁止**为统一而修任何工具测试的断言。

- [ ] **Step 2: 对账总账**

统计并写下:veil 移植数(Task 2 基线)+ pace 移植数(Task 3 基线)+ server(Step 1 前的 Task 11 数)+ 壳新增数(registry 1 + manifest 4 + build N + gen-icons 2 + store 3 + strings-source 1)。
逐项列出废弃清单:`build.test.mjs` 原断言中被替换的数目、`strings-source.test.mjs` 原 3 条的去向(1 条并入壳版,2 条随 manifest 静态源消失)、`gen-icons.test.mjs` 原 1 条(壳版 2 条取代)。
总原则:**nightveil 224 + video-acc 73 = 297 为起点,每一条增减都要有出处**。把对账表写进本任务的 commit message。

- [ ] **Step 3: Commit**

```bash
git add octopus/package.json octopus/package-lock.json 2>/dev/null || git add octopus/package.json
git commit -m "test(m0): 测试合流对账 — <统一/分包>，总数 X(297−废弃 Y+新增 Z),逐项出处见正文"
```

---

### Task 13: 建档、归档与真机清单

**Files:**
- Create: `octopus/自主迭代.md`、`dark-mode/nightveil/ARCHIVED.md`、`video-acc/ARCHIVED.md`
- Modify: `octopus/docs/MILESTONES.md`(M0 勾账)、`octopus/docs/BACKLOG.md`(继承项落位)

- [ ] **Step 1: 自主迭代.md 建档**

通读 `dark-mode/nightveil/自主迭代.md` 与 `video-acc/自主迭代.md`,产出 octopus 版:
- 「工具级验收」两节:两个旧文件的全部验收标准**原文照搬**,各冠以「暗色模式(veil)」「视频倍速(pace)」;
- 「平台级验收」新增节,内容:manifest 装配正确性(装配测试)、注册表完整性、壳存储隔离(oct.shell 不与工具键互扰)、零工具互引(grep 断言:`grep -rn "tools/veil" src/tools/pace src/shell | grep -v registry` 零命中,反向同)。

- [ ] **Step 2: 零互引断言(平台级验收的活体检查)**

Run: `grep -rn "tools/veil" src/tools/pace | wc -l && grep -rn "tools/pace" src/tools/veil | wc -l && grep -rn "tools/veil/\|tools/pace/" src/shell | grep -v "src/shell/popup.js\|src/shell/background.js\|src/shell/options.js" | wc -l`
Expected: `0`、`0`、`0`(前两条=工具互引为零;第三条=壳除三个装配入口外不触工具内部)。

- [ ] **Step 3: 旧项目归档标注**

`dark-mode/nightveil/ARCHIVED.md`:

```md
# 已归档(2026-10-XX)
本项目自 octopus M0 起冻结,后续开发全部在 `../../octopus/` 进行。
术语、决策与验证证据保留于本目录,作为审计链。
```

`video-acc/ARCHIVED.md` 同文。两文件分别 commit:

```bash
git add dark-mode/nightveil/ARCHIVED.md && git commit -m "docs(m0): nightveil 归档 — 冻结指向 octopus"
git add video-acc/ARCHIVED.md && git commit -m "docs(m0): video-acc 归档 — 冻结指向 octopus"
```

- [ ] **Step 4: MILESTONES/BACKLOG 勾账与继承**

- `octopus/docs/MILESTONES.md`:M0 各项打勾,追加一段验收记录(测试对账总数、构建产物清单);
- `octopus/docs/BACKLOG.md`:通读两个旧项目的 BACKLOG/遗留记录,逐条并入「继承清扫」条目之下(保留原始措辞与出处文件名);
- 本计划文件勾完所有 checkbox。

```bash
git add octopus/自主迭代.md octopus/docs/MILESTONES.md octopus/docs/BACKLOG.md octopus/docs/superpowers/plans/2026-10-04-m0-platform-port.md
git commit -m "docs(m0): 自主迭代建档与关账勾选 — 验收对账入档"
```

- [ ] **Step 5: 真机过目清单(交付用户,M0 的最终门)**

给用户的清单(含 1 次人工加载扩展,项目惯例):
1. `chrome://extensions` 加载 `octopus/extension/`,卡片零错误;
2. 点图标 → popup:tab 条两键,默认暗色模式;切到视频倍速,关掉重开 → 仍在视频倍速(记忆);再切回暗色;
3. veil 面板:大开关翻全局 / 站点行排除+恢复(页面变亮 + **工具栏章鱼图标同步变浅盘** = 换盘真话活体)/ 三席切换 / 色温;
4. pace 面板:滑块调档 + 浮标 / 预设 / 保持开关 / 跳过秒数;`Alt+.`/`Alt+,`/`Alt+0`/`Alt+L` 四键实弹;
5. 设置页:popup「全部设置」跳转,标题 Octopus、wordmark「Octopus/暗色模式」,五组控件可用;
6. 右键菜单:排除/加入站点条目在场;
7. SW:扩展卡片「service worker」链接点开 console 零报错,`[视频倍速助手] service worker v0.1.0 已启动` 在场。

---

## Self-Review 记录

- **Spec coverage**:MILESTONES.md M0 的 9 个勾选项 ↔ Task 1(脚手架)/4(契约注册表)/5+6(装配+钉子)/8+9+10(壳六件套:bootstrap、路由=命名空间预留说明于 ADR、存储、文案、popup、options)/2+3(veil/pace 移植)/7(图标首切)/6(activeTab 实证)/12(测试合流)/11(fixtures)/13(自主迭代建档);真机过目 = Task 13 Step 5。「消息路由」在 M0 收敛为命名空间预留(两族消息不相交,ADR-0002 已载),不建空转代码——与 grilling Q8 裁决一致。
- **Placeholder 检查**:Task 6 的三个占位入口是显式的两段替换(占位→Task 9/10 真实现),非「later」;octopusMark 给了完整函数;无 TBD。
- **类型一致性**:`assembleManifest(tools, { version })` 在 Task 5 定义、Task 6/10 一致调用;`loadShell/saveShellPatch` 签名在 Task 8/9 一致;`oct.shell` 键名全计划唯一。
- **对 grilling 的两处显式偏移**(需向用户披露):①pace 文案收纳推迟 M1(原 Q9 裁决「移植时收进」);②「文案聚合」服务推迟 M1(Q9 壳六件套之一)。理由同源:M0 无消费者,避免为想象中的消费者写真实代码;M1 设计迭代天然触碰全部文案。
