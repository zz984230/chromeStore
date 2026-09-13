# M2c · 配置面（30+ 子选项 UI + 前置门）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引擎 38 个子选项全部获得 1:1 UI（第 IV 分区完整实现），三个 M2a 终审前置门关闭（@media 条件包裹、engine 子组两级合并、站点回退真实站复验），M2b 遗留 defer 项消化（fetched-set、逐开关运行时验证、class 风暴实测），真实站点抽查通过。

**Architecture:** 选项页沿用 M1b 的 JS 构建模式（`section/note/box` helpers + strings.js 单源 + 自动保存）。设置写入走整 `engine` 组 patch（两级合并后部分写安全）。@keyframes/@media/@supports 改写按原版语义：子规则改写后**重新包回原条件**插入引擎表。shadow 验收补一张 fixture。纯函数照旧单测；UI/运行时经 fixtures http 挂载 + /tabbit + 用户配合开关。

**Tech Stack:** 同前（esbuild + node --test + /tabbit）。

## Global Constraints

- **规格唯一来源**：`docs/M2-BEHAVIOR.md` §8（38 键映射表——UI 控件清单的唯一合同，控件类型随原语义：checkbox/radio/number/text/color/textarea）、§1（j/k/l 三态语义）、§0-④（m.1/m.3 依赖与 LongTaskTiming 检查）、§2-2（extraRules 可编辑）。
- 文案单源：全部新 UI 文案进 `src/shared/strings.js`（strings-source 测试模式沿用）；无硬编码字符串。
- 零运行时依赖；每任务 `npm test` 全绿 + `npm run build` 干净才提交；提交含 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- M2c 边界：**不做** M3 项（色温/定时/防删监测/documentroot/字体大小——映射表中标注（M3 项）的不做）。
- 选项页既有行为不回归：七分区框架、自动保存、Reset、http 挂载预览态（D8 模式）。

---

### Task 1: 前置门①——@media/@supports 条件包裹 + @keyframes 整块复制

**Files:** Modify `src/content/engine/engine.js`；Test `tests/unit/engine-conditional.test.mjs`（新）

**Interfaces:**
- Produces: `wrapConditional(conditionText, ruleText)` → `'@media <cond> { <rule> }'` / `'@supports <cond> { <rule> }'`（纯函数，单测）；`copyKeyframesBlock(keyframesRule)` → 整块 cssText 字符串（供 insertRule）。
- 行为（M2-BEHAVIOR §4）：d.1 开 → @media 子规则改写后以 `@media <conditionText> { … }` 包裹插入；d.3 同理 @supports；d.2 开 → @keyframes 整块复制进引擎表，随后逐关键帧改写颜色属性（复制块的 cssRules 上直接 setProperty）。deepRules 递归时条件链沿父链累积（嵌套 @media 内 @supports → 双层包裹，按外层优先顺序拼接）。
- 实现：`visitRule` 向下传 `conditions: string[]`；`emit`/`insertEngineRule` 接受条件数组，非空时逐层包裹后 insertRule（dedup 键含条件串）。

**Steps:** ① wrapConditional/copyKeyframes 纯函数失败测试（含嵌套条件链与空串丢弃）→ RED → 实现 → GREEN；② engine 接线（visitRule 条件传递 + keyframes 分支）→ 全量 + build → 提交 `feat(engine): conditional re-wrapping for media/supports and keyframes copy`。

### Task 2: 前置门②——settings engine 子组两级合并

**Files:** Modify `src/shared/settings.js`；Test extend `tests/unit/settings.test.mjs`

**Interfaces:** `mergeWithDefaults` 对 engine 的已知子组（`darken/fallback/alphaRange/luminanceRange/nearWhiteAdjust/contextAwareTargets/variables`）做第二级合并；`exclusionRules` 保持一级。测试：stored 部分 `variables` 只覆盖给定键、其余 17 个回填；部分 `darken` 同理；非子组键不受影响。

**Steps:** 失败测试 → RED → 实现（`NESTED_SUBGROUPS` 表驱动）→ GREEN + 全量 + build → 提交 `feat(settings): two-level merge for engine option subgroups`。

### Task 3: fetched-set 陈旧 href 修复（M2b 遗留）

**Files:** Modify `src/content/engine/engine.js`；Test extend 既有 engine 测试或新增小文件

**Interfaces:** 克隆 `<style>` 增加 `data-nv-href` 属性；`requestSheetFetch` 先查 DOM 内是否已有该 href 的克隆（有则直接扫描它，跳过 fetch）；`deactivateEngine` 清空 `fetched`。测试：纯逻辑部分（href→克隆查询谓词 `hasCloneFor(href, docLike)` 可注入 document 桩）。

**Steps:** 失败测试 → RED → 实现 → GREEN + 全量 + build → 提交 `fix(engine): clear fetched cache on teardown and reuse existing clones by href`。

### Task 4: 第 IV 分区骨架 + 引擎席位主开关 + 站点策略三态

**Files:** Modify `src/options/main.js`、`src/shared/strings.js`；Test extend `tests/unit/strings-source.test.mjs` 或新增 `tests/unit/options-engine.test.mjs`

**Interfaces:**
- 座位主开关：checkbox「使用自适应引擎（第 41 席）」——勾选 → `saveSettings({ themeId: 'adaptive' })`；第 I 分区任一 palette 选中 → `themeId: <paletteId>`；主开关 checked ⟺ `themeId === 'adaptive'`（第 I 分区 radios 与主开关构成单选命名空间，与原版 dark_41 同机制）。
- `engine.siteThemePolicy` 三态 radio（respect / ignore / skip-compatible，默认 skip-compatible）——文案语义按 M2-BEHAVIOR §1。
- 分区骨架：`section('sec-engine', …)` 展开为分组容器（a/b/c/d/e/fgh/i/jkl/m/n 组标题 + 控件宿主 div，id 规范 `eng-<key>`，如 `eng-darken-text`）。
- strings：`sectionEngineNote` 更新为实义文案 + 席位/策略标签 + 组标题串（本任务约 15 条新 string）。
- http 挂载预览态：沿用既有 disabled 逻辑（storage 不可用时控件禁用 + optionsPreviewNote）。

**Steps:** 失败测试（骨架渲染形状：分组存在、主开关联动逻辑纯函数 `seatCheckboxState(themeId)`、三态默认值）→ RED → 实现 → GREEN + 全量 + build → 提交 `feat(options): engine section skeleton with seat master and site policy`。

### Task 5: 30+ 子选项控件渲染 + 自动保存 + 互斥

**Files:** Modify `src/options/main.js`、`src/shared/strings.js`；Test extend Task 4 的测试文件

**Interfaces:**
- 控件清单**以 M2-BEHAVIOR §8 表为唯一合同**逐键渲染：checkbox（布尔键）、number（区间/阈值/延迟，min/max/step 按 §8 默认与原版范围）、text（gradientShade）。II 区补 recheck + recheckDelay 一对（engine 组键，置于分区 II 的 Behavior 框，文案按映射表）。
- 自动保存：任一控件变更 → `saveSettings({ engine: <整组当前值> })`（读当前 UI 状态组装整组——两级合并使整组写也安全，且避免读-改-写竞态：从上次渲染的 settings 快照 + 本次变更组装）。
- 互斥：m.2/m.3 radio 二选一；选 m.3 时若 `PerformanceLongTaskTiming === undefined` → alert（STRINGS 新串）+ 回退 m.2（对等原版行为，M2-BEHAVIOR §0-④）。j/k/l radio 互斥由同名 name 自然保证。
- 座位关闭时（主开关未勾）分区控件禁用（`fieldset disabled` 或等价），勾选后启用——对等原版 `data-native` 的 div disabled 行为。
- Reset 兼容：既有 Reset 写 DEFAULT_SETTINGS（含 engine 整组）→ UI 全部回默认勾选态。

**Steps:** 失败测试（渲染形状快照：38 键 → 控件存在性与类型；组装函数 `assembleEnginePatch(uiState)` 纯函数整组输出；互斥回退逻辑 `tuningFallback(supportsLongTask, chosen)` 纯函数）→ RED → 实现 → GREEN + 全量 + build → 提交 `feat(options): full engine sub-option controls with autosave and exclusivity`。

### Task 6: 18 变量编辑器 + extraRules

**Files:** Modify `src/options/main.js`、`src/shared/strings.js`；Test 同上扩展

**Interfaces:**
- 9 色变量（--nv-surface/text/link/link-visited/cite/accent/edge/ink/mark）→ `<input type="color">`；9 文本变量（figure-opacity/image-brightness/shadow-box/shadow-text/transparent/image-veil/image-filter/blend/scrollbar）→ `<input type="text">`。
- 值变更 → `engine.variables` 整组写（color input 产出 #rrggbb，合法性天然；text 变量原样存储——运行时容错由引擎既有 parse 承担，无效值回退路径已存在）。
- extraRules：textarea，初值 = 当前 `engine.extraRules ?? EXTRA_RULES_DEFAULT`；变更存 `engine.extraRules`（空串 → 存空串，引擎侧 `?? 默认` 语义已处理 null 而非空串——**明确**：空串按原版行为视为「用户清空 = 不追加任何规则」）。
- strings：变量组标题 + extraRules 标签/提示（约 6 条）。

**Steps:** 失败测试（18 控件类型与初值、assemble 含 variables/extraRules）→ RED → 实现 → GREEN + 全量 + build → 提交 `feat(options): engine variable editors and extra rules textarea`。

### Task 7: shadow 验收 fixture

**Files:** Create `tests/fixtures/shadow.html`；Test extend `tests/unit/server.test.mjs`（路径遍历守卫自动覆盖新页？确认断言模式）

**Interfaces:** 页面含 2 个自定义宿主元素，`attachShadow({mode:'closed'})`（验证 hook 强制 open）+ shadow 内 `<style>`（一个 `:host { background:#fff }`、一个裸 `.inner { color:#0000dd }`）+ shadow 内嵌套元素。静态页无 JS 依赖（attachShadow 内联脚本写在页面里）。

**Steps:** 创建 fixture → fixtures 服务可访问断言（200 + 关键字）→ 提交 `test: shadow DOM fixture for engine acceptance`。

### Task 8: 验收 A——选项页挂载断言 + 逐开关运行时电池（用户配合）

**Files:** 无源码；证据进 MILESTONES。

- [ ] `npm run build && npm test` 全绿。
- [ ] fixtures 服务 + **用户重载扩展**。
- [ ] **fixtures http 挂载**（D8 模式：产物临时拷入 tests/fixtures/，验完即删）：断言第 IV 分区 38 控件齐全（按 §8 表逐键 id 存在 + 类型正确）、预览禁用态、席位主开关与第 I 分区单选联动（纯 DOM 状态断言）。
- [ ] **用户开关电池**（真机选项页，用户操作，tabbit 断言页面效果）：
  - f 开 → heavy.html 出现 `nv-inline-*` 类 + 引擎表含内联规则（600 卡的 `style="color:#333"` 等）；关 → 新激活后无残留规则。
  - i.1 开 → heavy.html class 变更风暴实测（脚本改 200 次 class → 记录重扫次数/CPU 时间数值，不硬断）。
  - m.1+m.3 开 → paint/layout-shift 触发重扫（注入样式后无需元素 MO 路径？——m.3 下注入走 PO 重扫，断言改写仍 ≤1s）。
  - g 开 → shadow.html：宿主被 hook 标记（`data-nv-shadowhost`）、shadow 内 `:host` 与裸 `.inner` 规则被改写（shadow root adoptedStyleSheets 有我们的表）、整页/宿主内可读。
  - d.1+d.2+d.3 开 → vars/heavy 中带 @media 的规则以包裹形式进引擎表（抽查引擎表文本含 `@media`）。
- [ ] 全量回归：vars/plain/media/heavy M2a/M2b 基线复验。

### Task 9: 验收 B——真实站点抽查 + 闭环

- [ ] **新浪财经、知乎、MDN**（引擎裸能力，无站点主题覆盖）：Dark 下整页可读、文字对比充分、无白闪残留；截图 + AI 视觉复核。
- [ ] **github**（站点回退组合复验，前置门③）：引擎默认（skip-compatible）下 github 走「nv-simple 基础层 + 站点层」组合——断言 `nv-classic` 与 `nv-site` 同在、`data-nv-site="github"`、页面暗色为组合效果。
- [ ] 切 j（respect）/k（ignore）抽验各一次语义正确。
- [ ] MILESTONES M2c 勾选 + 验收证据段（含 class 风暴实测数值）+ 提交 + 终审。

---

## Self-Review 记录

- **规格覆盖**：§8 表 38 键 → Task 5（映射表交付即 M2-BEHAVIOR §8 本身，已在库）；§1 三态 → Task 4；§0-④ m.3 依赖回退 → Task 5；§2-2 extraRules → Task 6；前置门①②③ → Task 1/2/9；M2b defer（fetched、逐开关、class 风暴、PO 运行时）→ Task 3/8。
- **占位符扫描**：UI 控件清单以库内合同表（M2-BEHAVIOR §8）为规格引用并规定渲染/保存/互斥机制——非 TBD；其余步骤含完整代码级指示。
- **类型一致性**：`assembleEnginePatch(uiState)`、`seatCheckboxState(themeId)`、`tuningFallback(supportsLongTask, chosen)`、`wrapConditional(conditionText, ruleText)`、`hasCloneFor(href, docLike)` 命名全程一致；engine patch 整组写与 Task 2 两级合并互补。
- **已知取舍**：m.3 的 LongTaskTiming 检查在选项页运行时执行（http 挂载预览态跳过该检查，仅真机生效——预览态本就禁用）；变量 text 输入不做前端校验（引擎运行时已有回退路径）。
