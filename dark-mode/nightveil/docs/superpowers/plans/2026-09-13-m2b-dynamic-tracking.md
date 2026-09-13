# M2b · 动态性（变更追踪 + 重扫调度）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引擎获得动态追踪能力——常开元素 MO、可选 style/class MO、可选 PerformanceObserver、持续处理、load 后 recheck、内联样式改写、Shadow DOM 穿透；heavy.html 动态插入样式表 ≤1s 完成改写；M2b 性能数值记录不硬断。

**Architecture:** 在 M2a 静态核心上加一层「调度器 + 观察器」：engine.js 的扫描逻辑重构为可重入（`rescan()` 全量 / `processSheetOf(node)` 增量），所有触发源经 0ms 去抖合并。Shadow DOM 走原版同款方案：主世界 hook 脚本（`web_accessible_resources` 暴露）强制 attachShadow 为 open 并标记宿主，内容侧收集开放 shadowRoot 的样式表，改写规则写进每 shadow 一张的 adopted 引擎表。纯函数（调度决策、观察器配置推导、内联类名分配）单测锁定；DOM 编排经 /tabbit 验收。

**Tech Stack:** 同 M2a（ES Modules + esbuild + node --test + /tabbit）。新增一个无需打包的静态 hook 脚本 `public/nv-shadow-hook.js`。

## Global Constraints

- **规格唯一来源**：`docs/M2-BEHAVIOR.md` §6（变更追踪与调度）+ §2-4（guard 移除时机）+ §0-⑧（内联五属性）+ §5（Shadow DOM 行为）。实现期禁止读原版源码目录。
- 命名：CSS 变量 `--nv-*`、DOM 属性 `data-nv-*`、内联随机类前缀 `nv-inline-`、shadow 宿主标记属性 `data-nv-shadowhost`（值 = 随机类名 `nv-shdw-<rand>`）。
- 去抖统一 `setTimeout(fn, 0)`（§6：一切去抖 delay = 0）。
- **manifest 变更**（仅 Task 7）：`public/manifest.json` 加 `"web_accessible_resources": [{"resources": ["nv-shadow-hook.js"], "matches": ["<all_urls>"]}]`——非权限、无安装提示，仅暴露一个静态脚本 URL。已按自主迭代纪律单独征得用户同意后才执行 Task 7（见计划审批记录）。
- 零运行时依赖；每任务 `npm test` 全绿 + `npm run build` 干净才提交；提交含 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- M2b 边界：**不做** 30+ 选项 UI（M2c）、不做防删监测 checkstylesheet（M3，里程碑表既定）、不做 heavy 页性能硬断言（数值记录进验收段）。
- 引擎 settings 键已全部存在（M2a Task 6），本里程碑只读：`processInlineStyles`（f）、`processShadowStyles`（g）、`watchClassChanges`（i.1）、`watchNewElements`（i.2）、`performanceObserver`（m.1）、`tuning`（m.2/m.3）、`recheck`/`recheckDelay`。
- 选项门控路径的运行时验证：默认开路径（元素 MO、guard 时序、recheck）本里程碑 tabbit 验证；门控路径（f/g/i.1/i.2/m.1）单测锁接线逻辑 + M2c 分区验收逐开关复验（届时有 UI）。

---

### Task 1: 扫描可重入化 + 调度器（含 M2a 遗留 Minor 清理）

**Files:**
- Modify: `src/content/engine/engine.js`
- Test: `tests/unit/engine-scheduler.test.mjs`（新）

**Interfaces:**
- Produces（后续任务消费）:
  - `createScheduler()` → `{ schedule(key, fn), cancel(key), cancelAll() }`（0ms 去抖，同 key 合并；纯逻辑可注入 timer 桩）
  - `engine.rescanAll()`（全量：重收集 varMap + htmlProps + 扫全部表 + 内联重扫（f 开时））
  - `engine.processSheetOf(node)`（新增 link/style 节点 → 处理其 sheet，含跨域 fetch 路径）
  - `engine.refreshContext()`（varMap + htmlProps 快照刷新）
  - guard 时序改为 §2-4：**首条引擎规则写入后**延迟 `settings 里的 guard delay`（M1 的 GUARD_REMOVE_DELAY_MS 200ms）移除 guard；重页面（`document.querySelectorAll('*').length ≥ 1000`）跳过早移除、仍走 load 兜底。由 main.js 的 armGuard 暴露 `dismissGuardNow()` 钩子实现（见 Step 3 接线说明）。
- 清理（M2a 终审 Minor）：`htmlPropTokens` 每次扫描只算一次（快照存 `state.htmlProps`，`emit` 读快照）；`visitRule` 删未用的 `depth` 形参；`insertEngineRule` 删除从不读取的索引记账（保留 selector→已写规则集合的 Set 即可）。

- [ ] **Step 1: 失败测试**（`createScheduler` 的合并/取消语义，注入 `setTimeout/clearTimeout` 桩）

```js
// tests/unit/engine-scheduler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../../src/content/engine/engine.js';

test('same-key schedules coalesce into one run; different keys run separately', () => {
  const runs = [];
  const timers = new Map();
  const id = { n: 0 };
  const setTimeoutStub = (fn) => { const k = ++id.n; timers.set(k, fn); return k; };
  const clearTimeoutStub = (k) => { timers.delete(k); };
  const s = createScheduler(setTimeoutStub, clearTimeoutStub);
  s.schedule('a', () => runs.push('a1'));
  s.schedule('a', () => runs.push('a2'));
  s.schedule('b', () => runs.push('b'));
  assert.equal(runs.length, 0, 'deferred until timer fires');
  for (const fn of [...timers.values()]) fn();
  assert.deepEqual(runs, ['a2', 'b'], 'same key: only the latest payload runs');
});

test('cancel stops a pending run; cancelAll clears everything', () => {
  const runs = [];
  const timers = new Map();
  const id = { n: 0 };
  const s = createScheduler((fn) => { const k = ++id.n; timers.set(k, fn); return k; }, (k) => timers.delete(k));
  s.schedule('a', () => runs.push('a'));
  s.cancel('a');
  for (const fn of [...timers.values()]) fn();
  assert.deepEqual(runs, []);
  s.schedule('b', () => runs.push('b'));
  s.cancelAll();
  for (const fn of [...timers.values()]) fn();
  assert.deepEqual(runs, []);
});
```

- [ ] **Step 2: RED** — `npm test -- tests/unit/engine-scheduler.test.mjs` 失败（无导出）
- [ ] **Step 3: 实现**——engine.js：模块级 `createScheduler(setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout)`；`activateEngine` 重构为「挂载 + `rescanAll()`」；扫描主体提取为 `rescanAll`/`processSheetOf(node)`/`refreshContext`（挂到导出的 engine 对象或模块内由 observers 模块 import 的具名函数——**决定：导出 `engineRescanAll`、`engineProcessSheetOf`、`engineRefreshContext` 三个具名函数**，main.js 与 observers 均可消费）；guard 钩子：`activateEngine` 接受第二参 `{ onFirstRule }`，`insertEngineRule` 首次成功插入后调用一次。
- [ ] **Step 4: GREEN + 全量**（78+2=80）+ `npm run build`
- [ ] **Step 5: 提交** `refactor(engine): reentrant scan with scheduler, context snapshot, first-rule guard hook`

---

### Task 2: 常开元素 MutationObserver + tuning 轻路径

**Files:**
- Modify: `src/content/engine/engine.js`（观察器装配）
- Test: `tests/unit/engine-observer-config.test.mjs`（新，纯函数）

**Interfaces:**
- Produces: `decideObservers(engine)` → `{ elementMO: true, styleMO: boolean, classMO: boolean, poShort: boolean, poLong: boolean, continueWatch: boolean }`（纯推导，单测锁定；poShort/poLong 均要求 `performanceObserver && tuning === 'page-load'`，poLong 额外要求运行时 LongTaskTiming 支持——运行时检测留在装配层）
- 行为（§6）：
  - 元素 MO（documentElement，childList+subtree，**激活即挂、常开**）：新增 link/style → `engineProcessSheetOf(node)`；`tuning === 'performance'` 时另调度 `engineRefreshContext()`；新增 iframe/script → `tuning === 'performance'` 时调度 `engineRescanAll()`。全部经 scheduler key（`'node'`/`'ctx'`/`'rescan'`）合并。
  - `deactivateEngine` 断开全部观察器（状态存模块级，幂等 disconnect）。
- main.js 接线不变（activate/deactivate 已在 M2a 就位）。

- [ ] **Step 1: 失败测试**（decideObservers 的 8 种关键组合真值表）
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**（decideObservers 纯函数 + engine.js 装配代码）
- [ ] **Step 4: GREEN + 全量 + build**
- [ ] **Step 5: 提交** `feat(engine): always-on element observer with performance-mode light paths`

---

### Task 3: 内联样式改写（f）+ style 属性 MO

**Files:**
- Modify: `src/content/engine/engine.js`
- Test: `tests/unit/engine-inline.test.mjs`（新，纯部分）

**Interfaces:**
- Produces:
  - `inlineClassFor(node)` → 既有 `nv-inline-<rand>` 类名或新生成（幂等；纯可测——接受 `classList.contains` 语义桩或直接对类名生成器 `randInlineClass()` 测格式与唯一性）
  - `INLINE_PROPS = ['color', 'border-color', 'background', 'background-color', 'background-image']`（§0-⑧ 五属性）
  - `rewriteInlineNode(node, engine, varMap)`：无 `nv-inline-` 类则分配；逐属性经 `rewriteColor`/背景图处理产出值；emit 规则 `html[data-nv-active] .nv-inline-XXXX { prop: value !important }`（内联恒 important，§0-⑧）；自定义属性（`--*` 非 `--nv-*`）入 varMap。
  - style 属性 MO（attributeFilter `['style']`，仅 `processInlineStyles` 开时装配）：变更的 style 值含颜色类 token（`--`、`color:`、`background` 等）→ 调度 `rewriteInlineNode(target)`（scheduler key `'inline'`）。
  - 激活时 `rescanAll()` 含 `[style]` 全量内联重扫（f 开时）。
  - heavy.html 验收锚点：卡片 `style="color:#333"` → `#333333` lum≈0.031 ≤ min → preserveDarkColors 保留原色？**注意**：#333 是深色文字，按契约应保留——但 heavy 页 body `color:#222` 同理。验收锚点改用卡片 `border:1px solid #ddd`（#dddcd? #dddddd lum≈0.72 ∈ (0.10,0.75] → darken 10% hex8）与 `p[style]` 在 f 开时的规则**存在性**断言（`document.querySelector('.nv-inline-')` 存在 + 引擎表含 `.nv-inline-` 规则），不做颜色值硬断（f 默认关，M2c 复验值）。

- [ ] **Step 1: 失败测试**（randInlineClass 格式/唯一；INLINE_PROPS 集合；rewriteInlineNode 的 emit 调用形状用引擎表桩验证——通过注入 `insertFn` 计数器）
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN + 全量 + build**
- [ ] **Step 5: 提交** `feat(engine): inline style rewriting with random-class rules`

---

### Task 4: class MO（i.1）+ 持续处理（i.2）

**Files:**
- Modify: `src/content/engine/engine.js`
- Test: extend `tests/unit/engine-observer-config.test.mjs`（真值表已含 classMO/continueWatch——本任务补实现侧）

**Interfaces:**
- 行为（§6）：
  - class MO（attributeFilter `['class']`，subtree，`watchClassChanges` 开才挂）→ 任意 class 变更 → 调度 `engineRescanAll()`（key `'class-rescan'`）。
  - 持续处理（`watchNewElements` 开）：元素 MO 回调里，load 后新增的**非** link/style/iframe/script 元素，若带 id 或 class 且未见过（`seenNodeKeys` Set，键 = id 或 className）→ 调度 `engineRescanAll()`（key `'new-el'`）。
  - 两路均经 scheduler 合并；`deactivateEngine` 清 `seenNodeKeys`。

- [ ] **Step 1: 补 decideObservers 真值表用例**（若有缺口）→ RED → 实现 → GREEN
- [ ] **Step 2: 全量 + build + 提交** `feat(engine): class-change and new-element rescans`

---

### Task 5: PerformanceObserver（m.1 + m.3 longtask）

**Files:**
- Modify: `src/content/engine/engine.js`
- Test: extend `tests/unit/engine-observer-config.test.mjs`

**Interfaces:**
- 行为（§6 + §8 备注）：
  - `performanceObserver` 开才装配 PO；`tuning === 'page-load'` 时：
    - short（`entryTypes: ['paint','layout-shift']`）→ 调度 `engineRefreshContext()` + `engineRescanAll()`（key `'po-short'`）。
    - long（`entryTypes: ['longtask']`，仅 `window.PerformanceLongTaskTiming !== undefined`）→ 页面 `document.visibilityState === 'hidden'` 时延迟 300ms 调度 `engineRescanAll()`（key `'po-long'`，经 scheduler 传 300ms？**决定**：scheduler 支持 `schedule(key, fn, delay = 0)`，本路传 300）。
  - `tuning === 'performance'` 时 PO 不装配（§6：m.1 是 m.3 的依赖，但独立开 m.1 只影响…… 原版 m.1 单开时 PO 建了但回调门控 `best.pageload`——**照抄**：PO 装配仅看 `performanceObserver`，回调内再判 `tuning === 'page-load'` 才重扫）。
  - `deactivateEngine` disconnect 全部 PO。
  - scheduler 签名扩为 `schedule(key, fn, delay = 0)`——Task 1 测试补一例带 delay 的调度。

- [ ] **Step 1: 测试**（decideObserver 真值表 poShort/poLong 列 + scheduler delay 用例）→ RED → 实现 → GREEN
- [ ] **Step 2: 全量 + build + 提交** `feat(engine): PerformanceObserver tracking with longtask deferral`

---

### Task 6: recheck（load 后延迟重渲染）

**Files:**
- Modify: `src/content/main.js`
- Test: 无新单测（接线 6 行；tabbit 验证）

**Interfaces:**
- 行为（§6）：引擎激活路径中，`window load` 后若 `settings.engine.recheck` → `setTimeout(() => render(lastSettings), recheckDelay)`（`lastSettings` 为 main.js 缓存的最近一次渲染入参；`renderGeneration` 机制天然防陈旧回调）。recheck 触发的重渲染会重走排除评估（迟到的 dark-scheme meta / 暗背景检测有机会拆除）。
- 实现：main.js 顶部 `let lastSettings = null;`，`render(settings)` 首行赋值；`applyEngine` 尾部：

```js
  if (settings.engine.recheck) {
    window.addEventListener('load', () => {
      const gen2 = gen; // applyEngine 无法拿到 gen——改为在 render() 的 load 监听后追加（见下）
    }, { once: true });
  }
```
**修正实现位置**：gen 只在 render 作用域可见——recheck 挂载放 `render()` 内（引擎或经典路径均可受益，但按规格 recheck 是 II 区通用项且 M2a 已把 nativerecheck 归入 engine 组；**实现放 render() 尾部、仅当 `settings.themeId === 'adaptive'` 时挂**，与规格面一致）：
```js
  if (settings.themeId === 'adaptive' && settings.engine.recheck
      && document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      if (gen !== renderGeneration) return;
      setTimeout(() => { if (gen === renderGeneration) render(lastSettings); },
        Number(settings.engine.recheckDelay) || 0);
    }, { once: true });
  }
```

- [ ] **Step 1: 实现 + 全量测试 + build**
- [ ] **Step 2: 提交** `feat(content): post-load recheck re-render for the engine path`

---

### Task 7: Shadow DOM 穿透（g）⚠️ 含 manifest 变更

**Files:**
- Create: `public/nv-shadow-hook.js`（静态主世界脚本，不进 esbuild）
- Modify: `public/manifest.json`（web_accessible_resources——**已获用户同意**）
- Modify: `src/content/engine/engine.js`（shadow 表收集与处理）、`src/content/main.js`（message 监听）
- Test: `tests/unit/engine-shadow.test.mjs`（纯部分：hook 脚本文本静态断言 + shadow 键生成）

**Interfaces:**
- 主世界 hook（`public/nv-shadow-hook.js`，IIFE，DOMContentLoaded 前后均安全）：
  - `Element.prototype.attachShadow` 代理：调用前若宿主未标记 → 设 `data-nv-shadowhost="nv-shdw-<rand>"`；按 `document.documentElement.hasAttribute('data-nv-active')` 同步宿主 `data-nv-active`；`postMessage({ from: 'nv-shadow-attach' }, '*')`（节流：仅首标记时发）；**强制 `init.mode = 'open'`**（§5）。
  - 脚本自曝 `window.__nvShadowHook = true`（诊断锚点）。
- 内容侧：
  - main.js `window.addEventListener('message')`：`e.data?.from === 'nv-shadow-attach'` → 调度（scheduler key `'shadow'`）`engineProcessShadowRoots()`。
  - engine.js `engineProcessShadowRoots()`（`processShadowStyles` 开时）：递归找 `[data-nv-shadowhost]` 宿主（open root）→ 收集 `shadowRoot.styleSheets + adoptedStyleSheets` → 每 shadow 一张 `new CSSStyleSheet()`（模块级 Map：宿主键 → 表；`sheet.disabled` 随激活态）→ 逐表 `visitRule`（`:host` 段经 transformSelector 的 `:host` 分支产出 `:host([data-nv-active])` 形式）→ 追加进 `shadowRoot.adoptedStyleSheets`。
  - `deactivateEngine`：全部 shadow 引擎表 `disabled = true` + 宿主移除 `data-nv-active`；激活时反向（M2a 克隆复活同款语义）。
  - shadow 表与主引擎表共用 dedup Set 与 varMap。
- manifest（public/manifest.json）：

```json
"web_accessible_resources": [
  { "resources": ["nv-shadow-hook.js"], "matches": ["<all_urls>"] }
]
```

- 注入：`processShadowStyles` 开时，`activateEngine` 追加 `<script src="${chrome.runtime.getURL('nv-shadow-hook.js')}" data-nv-hook>` 到 documentElement（已存在则跳过）。

- [ ] **Step 1: 失败测试**（hook 脚本文本断言：含 attachShadow 代理、mode 强制 open、postMessage from 值；`nv-shdw-` 键格式；读 `public/nv-shadow-hook.js` 文本做包含断言即可——无需执行）
- [ ] **Step 2: RED → 实现（hook 脚本 + manifest + engine/main 接线）→ GREEN + 全量 + build**
- [ ] **Step 3: 提交** `feat(engine): shadow DOM penetration via main-world attachShadow hook`

---

### Task 8: 验收——heavy.html 动态断言 + 回归 + 性能数值记录

**Files:** 无新源码；`docs/MILESTONES.md` 勾选 M2b。

- [ ] **Step 1: `npm run build && npm test`** 全绿。
- [ ] **Step 2: fixtures 服务 + /tabbit（用户配合重载扩展；默认路径验证）**：
  - heavy.html：Dark 激活后，页面注入 `<style>.dyn { background: #ffffff; color: #0000ff }</style>` + 一个 `.dyn` 元素 → **≤1s 轮询**断言 `.dyn` 背景改写（`getComputedStyle` 非白）与文字非纯蓝——元素 MO 默认常开路径。
  - 连续注入 5 张样式表 → 全部 ≤1s 改写（scheduler 合并有效性）。
  - guard 时序：Dark 后引擎表首条规则写入 → guard 提前移除（heavy 600 卡 ≥1000 元素阈值则仍等 load——heavy 元素数约 600×6≈3600 ≥ 1000，断言 guard 在 load+250ms 内移除即可，两路径都覆盖）。
  - recheck：load 前插入 `<meta name="color-scheme" content="dark light">`？——改为验证 recheck 重渲染发生：注入一个迟到 `<style>body{background:#fff}</style>` 后 recheck（默认开、delay 0）触发重扫 → 该规则也被改写。
  - Light→Dark→Light 切换循环：观察器断开、无重复规则累积（引擎表规则数稳定）。
  - 回归：vars/plain/media 三页复验 M2a 断言 + 经典路径抽验。
  - 性能数值记录（不硬断）：`performance.now()` 差值记录 heavy.html 全量重扫耗时、动态单表处理耗时，写入验收段。
- [ ] **Step 3: MILESTONES M2b 勾选 + 验收证据段 + 提交。**

---

## Self-Review 记录

- **规格覆盖**：§6 七个触发源（元素/style/class/PO 短/PO 长/持续/recheck）→ Task 2/3/4/5/6；§0-⑧ 内联五属性+恒 important → Task 3；§5 shadow（hook + adopted 表 + 开关联动）→ Task 7；§2-4 guard 首规则时机 + 重页面阈值 → Task 1/8；M2a 遗留 Minor（htmlProps 快照、死 depth、死索引）→ Task 1。
- **占位符扫描**：DOM 装配步骤均给出函数签名、行为表与关键代码块；无 TBD。
- **类型一致性**：`schedule(key, fn, delay = 0)` 在 Task 1 定义、Task 5 使用一致；`engineRescanAll/engineProcessSheetOf/engineRefreshContext/engineProcessShadowRoots` 命名全程一致；`decideObservers` 返回键与 Task 2/4/5 真值表一致。
- **已知取舍**：guard「longtask-self 移除」第三触发器不实现（我们的 guard 已有 load 兜底，且 longtask 仅页面隐藏时活动——记录为与原版的可接受偏差，M2c 复核）；门控路径运行时验证部分顺延 M2c（届时有 UI），本里程碑以接线真值表 + 默认路径 tabbit 兜底。
