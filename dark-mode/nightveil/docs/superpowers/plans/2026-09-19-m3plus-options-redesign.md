# M3+ · 选项页重设计（Options Redesign）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 grilling 九项裁决与已认可设计稿（designs/2026-09-19-options-redesign-mockup.html，93ee8b6）重排选项页：首屏五组（天际线大开关/主题三席/色温/定时/站点）+ 高级折叠，界面中文化，暗色自设计视觉。

**Architecture:** 纯 UI 层重排（grilling Q8）：settings schema、content/SW 行为、既有控件 id 全部不动；只重写 public/options.html 骨架 + tokens、src/options/main.js 的渲染/同步、src/shared/strings.js 的值（英文→中文）。设计 tokens 与 CSS 从设计稿移植（设计稿即权威视觉规范）。ui.sectionOpen 键名随新折叠结构重定义（旧存值无害残留）。

**Tech Stack:** Chrome MV3 options page、纯 DOM 程序化构建（el()/section()/render+sync 既有模式）、node --test。

## Global Constraints

- 行为边界（grilling Q8）：设置键零改动；控件 id 稳定（fg-\*/ct-\*/sch-\*/usercss/eng-\*/data-m3key/data-rule/data-site 等全部保留）；唯一新增控件 id：`nv-state`（天际线大开关）。`input[name="state"]` 双 radio 被 `nv-state` 取代（D8 断言随之更新，无外部依赖）。
- 视觉权威：docs/superpowers/designs/2026-09-19-options-redesign-mockup.html——tokens（--bg #12141c/--surface #1a1e2a/--gold #e3c987/--dusk #8fb3d9/宋体标题×苹方正文）、结构与微交互以稿为准；禁止照抄 Dark Reader 代码/风格（其只是信息架构参照）。
- 文案单源：一切 UI 文案仍只能来自 strings.js；本迭代把用户可见值全部改中文；开发者日志键（swStartedDebug/contentActiveLog/optionsSaveError）保持英文。
- 测试：npm test 全绿后才可提交；不改既有测试期望值（只可追加）；M2c/M3 的单测不因布局重排而改（options-engine 表测试引用 STRINGS 键名而非字面量，天然免疫）。
- 构建：npm run build 三入口零错误；extension/ 为构建产物，源改 public/。
- 提交前缀 feat(m3+)/fix(m3+)/test(m3+)，结尾 Co-Authored-By 行。
- 禁止顺手改良：与重设计无关的代码一律不动。

---

### Task 1: 设计系统落地（public/options.html 骨架 + tokens CSS）

**Files:**
- Modify: `public/options.html`（全量重写）

**Interfaces:**
- Consumes: 设计稿 CSS（mockup `<style>` 块）与 DOM 结构。
- Produces: 静态骨架，main.js 渲染挂点齐全——
  ```html
  <main>
    <header><div class="wordmark" id="nv-wordmark"></div><button id="reset"></button></header>
    <div class="dusk" id="nv-dusk-host"></div>            <!-- 大开关容器（main.js 填充） -->
    <section id="sec-theme"></section>
    <section id="sec-colortemp"></section>
    <section id="sec-schedule"></section>
    <section id="sec-sites"></section>
    <details class="adv" id="sec-advanced"><summary id="adv-summary"></summary>
      <div class="adv-groups">
        <div class="adv-group" id="adv-engine"></div>
        <div class="adv-group" id="adv-guard"></div>
        <div class="adv-group" id="adv-rules"></div>
        <div class="adv-group" id="adv-misc"></div>
      </div>
    </details>
  </main>
  ```
  `<style>` 携带设计稿全部 tokens 与组件类（.dusk/.dusk-switch/.sky/.orb/.stars/.seats/.seat/.palette-pop/.swatches/.row/.inline-switch/.dimmed/.site-mode/textarea/details.adv/.adv-groups/.adv-group/.mini/.ct-dot/.hint/.sec-head/.wordmark/.reset），并保留两条产品约束：`body { font-size: var(--font-size, 13px); }`（ui.fontSize 生效）与 `main[data-preview] { opacity: .7; }`（预览态指示；pointer-events 保留，预览页本无可写存储）。

- [ ] **Step 1: 重写 public/options.html**

以设计稿为源逐段移植：`<head>` 的 meta/title 改「夜幕 NightVeil 选项」；`<style>` 整体移植设计稿样式并按 Produces 骨架补两条产品约束；`<body>` 按上方骨架书写（空容器 + 静态 wordmark 结构 `<div class="wordmark">夜幕<small>NIGHTVEIL</small></div>`，reset 按钮保留 id）。`prefers-reduced-motion` 与 focus-visible 规则随稿保留。`<script src="options.js"></script>` 收尾。

- [ ] **Step 2: 构建验证**

Run: `cd /Users/zero/Project/chromeStore/dark-mode/nightveil && npm run build`
Expected: 零错误；extension/options.html 重新生成。

- [ ] **Step 3: 预览目视（http 挂载只剩骨架不崩）**

Run: `cd extension && python3 -m http.server 8124 &`，tabbit 打开 `http://localhost:8124/options.html`，断言：wordmark 渲染、五个 section 容器存在、高级 details 默认闭合、无 JS 报错（此时 main.js 还是旧渲染，挂点缺失可容忍 console 报 null——以「不白屏、骨架可见」为准；Task 3/4 完成后复验）。
（本任务无单测——静态骨架；D8 断言在 Task 5。）

- [ ] **Step 4: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/public/options.html
git commit -m "feat(m3+): options shell — design tokens, dusk/seat/adv structure from approved mockup"
```

---

### Task 2: 文案全面中文化

**Files:**
- Modify: `src/shared/strings.js`（值改写）
- Test: Create `tests/unit/strings-zh.test.mjs`

**Interfaces:**
- Consumes: 既有 169 键清单。
- Produces: 全部用户可见键为中文值；三键保持英文（swStartedDebug/contentActiveLog/optionsSaveError 为开发者日志）。

- [ ] **Step 1: 写失败测试** `tests/unit/strings-zh.test.mjs`

```js
// tests/unit/strings-zh.test.mjs
// M3+ Q5 裁决：用户可见文案全部中文化；开发者日志键保持英文。钉住语言面，
// 防止后续任务顺手回退英文。
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from '../../src/shared/strings.js';

const DEV_LOG_KEYS = ['swStartedDebug', 'contentActiveLog', 'optionsSaveError'];

test('every user-visible string contains CJK (Chinese UI ruling)', () => {
  const offenders = [];
  for (const [k, v] of Object.entries(STRINGS)) {
    if (DEV_LOG_KEYS.includes(k)) continue;
    if (typeof v === 'string' && v && !/[一-鿿]/.test(v)) offenders.push(k);
  }
  assert.deepEqual(offenders, []);
});

test('dev-log keys stay English', () => {
  for (const k of DEV_LOG_KEYS) assert.match(STRINGS[k], /^[A-Za-z]/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/strings-zh.test.mjs`
Expected: 第一个测试 FAIL（大量英文键）。

- [ ] **Step 3: 改写 strings.js 值**（完整映射——左为键名，右为新中文值；未列出的键按同表风格补齐并在提交信息注明）

结构性/标题类：
- optionsHeading: '夜幕'（页 title 由 options.html 承担；此键为页首标题源）
- optionsNote: '拉上夜幕，让整个浏览器安静下来。'
- optionsPreviewNote: '预览模式——当前页面无法访问设置存储，展示的是默认值。'
- resetButton: '恢复默认'
- sectionThemesLabel: '主题'；sectionOptionsLabel: '行为'（旧 II 区杂项并入高级后，此键用于杂项组内标题）；sectionUserCssLabel: '自定义 CSS'；sectionUserCssNote: '选中主题席位的「自定义 CSS」后，这里写的样式将整体生效。'
- sectionEngineLabel: '引擎调优'；sectionEngineNote: '38 项改写规则与 18 个引擎变量——默认值即推荐值，进阶精调再动。'
- sectionExclusionLabel: '排除列表'；sectionInclusionLabel: '包含列表'（站点卡片切换时的高级完整版入口用）
- sectionScheduleLabel: '定时'；sectionScheduleNote: '到点自动拉上或收起夜幕。'
- behaviorLabel: '行为'；rulesLabel: '页面规则'
- customThemeLabel: '自定义 CSS'
- duskTitleOn: '夜幕已拉上'；duskTitleOff: '夜幕已收起'；duskSubOn: '整个浏览器处于暗色，点一下收起'；duskSubOff: '点一下拉上夜幕，进入暗色浏览'（4 个新键）
- themeSeatEngineLabel: '自适应引擎'；themeSeatEngineDesc: '逐条改写网页本色，保留品牌色'；themeSeatClassicLabel: '经典主题'；themeSeatClassicDesc: '从固定配色里挑一套整体罩上'；themeSeatCustomLabel: '自定义 CSS'；themeSeatCustomDesc: '只应用你写的样式'（6 个新键；customThemeLabel 退役由 themeSeatCustomLabel 接替，键保留防回归引用）
- paletteLabel: '配色'；siteThemesLabel: '站点主题'；siteThemesNote: '十个站点的精修层，默认全部启用。'
- overlayFamilyLabel: '罩面家族'；invertFamilyLabel: '反色家族'；classicThemeLabel: '经典主题'
- colortempSectionLabel: '色温'；colortempSectionNote: '给亮色页面蒙一层暖光'
- ctEnableLabel: '启用色温'；sitesSectionLabel: '站点'；sitesSectionNote: '夜幕管到哪些网站'
- siteModeExcludeLabel: '全部生效，排除个别'；siteModeIncludeLabel: '仅列表内生效'（2 个新键）
- sitesHint: '一行一个域名，自动忽略 www.。也可以在网页上右键，把当前网站加进来。'
- advancedLabel: '高级设置'；advancedCountLabel: '引擎调优 · 防白闪 · 页面规则 · 杂项'（2 个新键）
- advEngineLabel: '引擎调优'；advGuardLabel: '防白闪'；advRulesLabel: '页面规则'；advMiscLabel: '杂项'（4 个新键）

状态/菜单/标题（用户可见）：
- stateTitleDark: '当前状态：深色'；stateTitleLight: '当前状态：浅色'；stateTitleSiteOn: '当前网站：已拉上'；stateTitleSiteOff: '当前网站：已收起'
- menuExcludeSite: '此网站不用深色'；menuIncludeSite: '此网站加入深色'；menuExcludeColorTemp: '此网站停用色温'

行为/杂项/规则类（值示意，风格=动词开头、说人话）：
- inclusionModeLabel: '仅对列表内网站生效'；inclusionModeNote: '切换后，站点列表的含义随之改变。'；perSiteToggleLabel: '工具栏按网站切换'
- stateLightLabel: '浅色'；stateDarkLabel: '深色'
- ruleMetaSchemeLabel: '网页自带深色声明时让位'；ruleDarkBackgroundLabel: '网页底色已深时让位'；ruleBrightnessLabel: '底色深浅判定阈值'；ruleHtmlAttributesLabel: 'html 属性标记'；ruleHtmlClassesLabel: 'html 类名标记'；ruleCookiesLabel: 'Cookie 标记'
- listEditHint: '一行一个域名，自动忽略 www.；条目也覆盖其子域名。'
- exclusionListLabel: '排除的网站'；inclusionListLabel: '生效的网站'
- guardGroupLabel: '防白闪'；guardModeSimpleLabel: '简洁暗层'；guardModeHideLabel: '隐藏内容'；guardModeBrightnessLabel: '压暗亮度'；guardDelayLabel: '消退延迟（毫秒）'；guardThresholdLabel: '轻页阈值（元素数）'
- colorTempGroupLabel: '色温'；ctRedLabel: '色相偏红'；ctGreenLabel: '色相偏绿'；ctBlueLabel: '色相偏蓝'；ctOpacityLabel: '暖色浓度'；ctListLabel: '色温例外网站'；ctListHint: '一行一个域名，自动忽略 www.；精确匹配，不覆盖子域名。'
- documentRootLabel: '样式挂到 <html> 而不是 <head>'；reattachStylesLabel: '样式被页面删掉时重新挂回'；fontSizeLabel: '本页字号（像素）'
- userCssAreaLabel: '你的样式——选中「自定义 CSS」席位后整体生效'
- scheduleOnLabel: '入夜拉上'；scheduleOffLabel: '天亮收起'；schedulePermissionAlert: '需要「定时通知（alarms）」权限才能设置定时。'
- engineSeatLabel: '启用自适应引擎'
- enginePolicyRespectLabel: '尊重站点主题'；enginePolicyIgnoreLabel: '忽略站点主题'；enginePolicySkipCompatibleLabel: '跳过兼容款站点'；enginePolicyNote: '站点自带暗色方案时引擎如何让位。'
- 7 个引擎组标签：engineColorsGroupLabel: '颜色规则'；engineBackgroundsGroupLabel: '背景处理'；engineRulesGroupLabel: '规则细节'；engineScopeGroupLabel: '作用范围'；engineSitePolicyGroupLabel: '站点策略'；enginePerformanceGroupLabel: '性能取向'；engineVariablesGroupLabel: '引擎变量'
- 38 项 §8 子选项（engineDarkenTextLabel 起）：按「改写文字颜色 / 改写 SVG 填色 / 改写 SVG 描边 / 改写边框颜色 / 改写背景颜色 / 改写盒阴影 / 改写文字阴影 / 边框需有宽度才改 / 背景混合 / 保留背景属性 / 忽略 initial 属性 / 兜底色启用 / 兜底透明度 / 压暗背景图 / 移除渐变 / 连渐变色一起移除 / 压暗渐变 / 压暗渐变变量 / 渐变罩层 / 提升优先级 / 处理 @media / 处理 @keyframes / 处理 @supports / 按上下文区分 / 上下文-文字 / 上下文-边框 / 上下文-背景 / 上下文-SVG / 透明下限 / 透明上限 / 亮度下限 / 亮度上限 / 保留透明度 / 保留深色 / 近白微调 / 近白下限 / 近白上限 / 近白幅度」一一对应
- M2b 追加五项：engineProcessInlineStylesLabel: '处理内联样式'；engineProcessShadowStylesLabel: '处理 Shadow DOM 样式'；engineMapCssVariablesLabel: '映射 CSS 变量'；engineWatchClassChangesLabel: '监视类名变化'；engineWatchNewElementsLabel: '监视新增元素'；enginePerformanceObserverLabel: '性能观察器重扫'
- engineTuningPerformanceLabel: '性能优先'；engineTuningPageLoadLabel: '加载优先'；engineDeepRulesLabel: '深挖嵌套规则'；engineRecheckLabel: '加载后复查'；engineRecheckDelayLabel: '复查延迟（毫秒）'；engineTuningUnsupported: '当前浏览器不支持该选项。'
- engineVariablesNote: '引擎改写时引用的变量——页面底色、文字、链接等。'
- 18 变量标签：页面底色 / 文字 / 链接 / 已访链接 / 引用 / 强调 / 边框 / 墨色 / 标记 / 图表透明度 / 图片亮度 / 盒阴影 / 文字阴影 / 透明 / 图片罩层 / 图片滤镜 / 混合 / 滚动条
- engineExtraRulesLabel: '追加规则'；engineExtraRulesNote: '附加在引擎输出后的 CSS 规则，留空用默认模板。'
- extensionName: '夜幕'；extensionDescription: '为整个浏览器拉上一层温和的夜幕。'

（同表风格补齐 = 同语义域内短促、动词开头、无标点尾；实现者遇未列出键按此风格填中文并在 report 列出补齐清单。）

- [ ] **Step 4: 全量测试**

Run: `npm test`
Expected: 全绿（strings-zh 2 新测试过；strings-source 仍绿——单源未变）。

- [ ] **Step 5: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/shared/strings.js dark-mode/nightveil/tests/unit/strings-zh.test.mjs
git commit -m "feat(m3+): Chinese copy across the options surface (values only, single source kept)"
```

---

### Task 3: 首屏渲染重写（main.js 上半部）

**Files:**
- Modify: `src/options/main.js`（render/sync 重写首屏部分）
- Test: `tests/unit/options-m3.test.mjs`（追加 1 例）

**Interfaces:**
- Consumes: Task 1 骨架挂点；Task 2 中文键；既有 PALETTES/optionsEngine 表/editor.js。
- Produces: 首屏五组渲染 + 同步；新控件 id `nv-state`（checkbox，checked ⟺ settings.state==='dark'）；既有 id 全保留。

- [ ] **Step 1: 追加失败测试**（options-m3.test.mjs 末尾；纯表驱动部分）

```js
import { SEAT_CARDS } from '../../src/shared/optionsM3.js';
test('SEAT_CARDS maps the three theme seats onto themeId values', () => {
  assert.deepEqual(SEAT_CARDS.map((c) => c.themeId), ['adaptive', 'classic', 'custom']);
});
```

（DOM 渲染无 jsdom 单测——按项目惯例走 Task 5 的预览挂载断言。）

- [ ] **Step 2: optionsM3.js 追加 SEAT_CARDS 表**

```js
// 主题三席卡片（M3+ 首屏）：themeId 值域与席位 UI 的映射。
export const SEAT_CARDS = [
  { themeId: 'adaptive', title: STRINGS.themeSeatEngineLabel, desc: STRINGS.themeSeatEngineDesc },
  { themeId: 'classic', title: STRINGS.themeSeatClassicLabel, desc: STRINGS.themeSeatClassicDesc },
  { themeId: 'custom', title: STRINGS.themeSeatCustomLabel, desc: STRINGS.themeSeatCustomDesc },
];
```

- [ ] **Step 3: main.js 首屏重写**

删除 renderThemes/renderBehavior 中的首屏部分与 renderPlaceholders 残留调用，按挂点重写（完整函数——`el/section/note/save/current` 既有件照用）：

```js
// ---- 首屏：天际线大开关 ----
function renderDusk() {
  const host = $('#nv-dusk-host');
  const on = current.state === 'dark';
  const title = el('h2', { id: 'nv-dusk-title' }, on ? STRINGS.duskTitleOn : STRINGS.duskTitleOff);
  const sub = el('p', {}, on ? STRINGS.duskSubOn : STRINGS.duskSubOff);
  const input = el('input', { type: 'checkbox', id: 'nv-state', checked: on });
  const sw = el('label', { class: 'dusk-switch' }, input,
    el('span', { class: 'sky' }, el('span', { class: 'stars' }, ...[1,2,3,4].map(() => el('i'))), el('span', { class: 'orb' })));
  host.append(el('div', { class: 'dusk-copy' }, title, sub), sw);
  input.addEventListener('change', () => save({ state: input.checked ? 'dark' : 'light' }));
}

// ---- 首屏：主题三席 + 席位附属面板 ----
function renderThemeSeats() {
  const host = $('#sec-theme');
  host.append(el('div', { class: 'sec-head' }, el('h3', {}, STRINGS.sectionThemesLabel), el('span', { class: 'note' }, STRINGS.themeSeatNote)));
  const seats = el('div', { class: 'seats' });
  for (const card of SEAT_CARDS) {
    seats.append(el('label', { class: 'seat' },
      el('input', { type: 'radio', name: 'themeId', value: card.themeId === 'classic' ? PALETTES[0].id : card.themeId, checked: seatValue(current.themeId) === (card.themeId === 'classic' ? PALETTES[0].id : card.themeId) }),
      el('span', { class: 'seat-title' }, card.title),
      el('span', { class: 'seat-desc' }, card.desc)));
  }
  // classic 席位 radio 的 value 用首个调色板 id（themeId 值域约束）；三席单选互斥仍走 name 命名空间。
  ...
}
```

实现要点（完整代码在实现时按此展开，语义逐条钉死）：
1. `seatValue(themeId)`：`'adaptive'|'custom'` 原样；其他一律视为 classic 席位（含全部调色板 id）。
2. classic 席位选中 → 展示 `.palette-pop` 色板行（40 个 `.swatch`，背景=调色板 bg，`aria-pressed` 标当前，点击存 `themeId`）；custom 席位选中 → 同一容器位展示 userCss 编辑器（复用既有 `#usercss` textarea + keyup 保存 + `wireEditor`，见 M3 Task 8/10 既有代码整体搬移）；adaptive → 容器隐藏。
3. 色温组（`#sec-colortemp`）：`.sec-head` + 启用行（复用 `#ct-enabled` + inline-switch 结构 + `#ct-dot` 实时预览圆点，input 事件里同步 `dot.style.background = rgb(r g b / a)`）+ 四滑杆行（复用 `#ct-red/green/blue/opacity` + `output[for]` 实时值 + `--fill` 百分比，从设计稿 JS 移植 `fill()`/`redraw()` 逻辑）+ `#ct-list` textarea（迁移至本组底部，change→parseHostList 保存逻辑照 M3）。
4. 定时组（`#sec-schedule`）：启用开关（复用 `#sch-enabled` + 权限请求回退流）+ `#sch-on`/`#sch-off` 时间行 + `.dimmed` 联动。
5. 站点组（`#sec-sites`）：`.site-mode` 双 radio（新 name `siteMode`：排除=默认，包含=`data-key: inclusionMode` 语义——radio change → `save({ inclusionMode: checked值 })`）+ 当前模式对应单 textarea（排除模式绑 exclusionList、包含模式绑 inclusionList，切换即换绑并重渲染）+ `sitesHint`。
6. `syncFromSettings` 首屏部分：nv-state 勾选态、三席 radio 勾选、pop 容器可见性（classic→色板/custom→编辑器）、ct/sch/站点全部控件按 M3 既有同步逻辑逐 id 重派（activeElement 守卫照旧）。

- [ ] **Step 4: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/options/main.js dark-mode/nightveil/src/shared/optionsM3.js dark-mode/nightveil/tests/unit/options-m3.test.mjs
git commit -m "feat(m3+): first-screen render — dusk switch, theme seats with palette/usercss panels, CT/schedule/site groups"
```

---

### Task 4: 高级折叠区迁移（main.js 下半部 + sectionOpen 重定义）

**Files:**
- Modify: `src/options/main.js`；`src/shared/settings.js:37-39`（ui.sectionOpen 默认值）
- Test: `tests/unit/settings.test.mjs`（追加 1 例）

**Interfaces:**
- Consumes: Task 3 首屏；全部 M2c/M3 控件表（ENGINE_CONTROLS/ENGINE_VARIABLE_CONTROLS/ENGINE_EXTRA_RULES_CONTROL/ENGINE_GROUPS/ENGINE_SITE_POLICIES）。
- Produces: 高级四组（adv-engine/adv-guard/adv-rules/adv-misc）收纳全部剩余控件；`ui.sectionOpen = { advanced: false }`（新默认；旧键无害残留）。

- [ ] **Step 1: 追加失败测试**（settings.test.mjs）

```js
test('M3+ sectionOpen defaults to the advanced fold only', async () => {
  const mem = new MemoryStorage();
  const s = await loadSettings(mem);
  assert.deepEqual(s.ui.sectionOpen, { advanced: false });
});
```

- [ ] **Step 2: settings.js 改默认**

```js
    sectionOpen: { advanced: false },
```

- [ ] **Step 3: main.js 高级区迁移**

1. `#adv-summary` 填充：chev + advancedLabel + `.count` = advancedCountLabel；details toggle → `save({ ui: { ...current.ui, sectionOpen: { advanced: d.open } } })`（writable 守卫照 M3）。
2. adv-engine：引擎席位说明一行 + `#eng-controls` fieldset（disabled 由 `seatCheckboxState(themeId)` 派生——席位现为首屏卡片，复用该纯函数）+ ENGINE_GROUPS 七组控件 + 变量 + extraRules + 站点策略 jkl，全部按 M2c 既有 engineControl/variableControl 行渲染与委托保存逻辑搬移；组宿主 id（eng-group-\*）保留。
3. adv-guard：fg 四件套（M3 结构原样：master 在 fieldset 外的 wrapper 模式）。
4. adv-rules：exclusionRules 六控件（data-rule 委托照旧）。
5. adv-misc：站点主题 10 开关（data-site）+ perSiteToggle + documentRoot/reattachStyles（data-m3key）+ `#ui-fontsize`（字号行，--font-size 应用逻辑照 M3）+ 排除/包含完整列表入口（两个 textarea `data-list`，作为站点卡片的完整版备份视图）。
6. `syncFromSettings` 补齐以上全部 id 的重派 + `#sec-advanced`.open 派生；首屏旧的 sec-themes/sec-options/sec-engine/sec-exclusion/sec-inclusion/sec-schedule 渲染调用全部移除。
7. 旧 `renderListSection`/`renderEngine`/`renderBehavior` 中未被搬移的代码删除（orphan 清理属本任务变更面）。

- [ ] **Step 4: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/src/options/main.js dark-mode/nightveil/src/shared/settings.js dark-mode/nightveil/tests/unit/settings.test.mjs
git commit -m "feat(m3+): advanced fold — engine/guard/rules/misc groups host all migrated controls; sectionOpen redefined"
```

---

### Task 5: 回归、D8 断言重跑与收尾

**Files:**
- Modify: `docs/MILESTONES.md`（追加记录）；`docs/BACKLOG.md`（简洁模式条目移「已完成」）；`.superpowers/sdd/progress.md`

**Interfaces:** Consumes Task 1-4 全部。

- [ ] **Step 1: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿；记录测试总数。

- [ ] **Step 2: 预览挂载结构断言（tabbit，http://localhost:8124/options.html）**

断言清单（evaluate 一次取全）：wordmark 文本含「夜幕」；`#nv-state` 存在且 checked=false（默认 light）；三 `.seat` 存在且 adaptive 勾选；`.palette-pop` 不可见；`#ct-enabled`/四滑杆/`#ct-list` 在 `#sec-colortemp`；`#sch-*` 在 `#sec-schedule`；site-mode 双 radio 默认排除勾选 + 单 textarea；`#sec-advanced` 存在且 open=false；`details` 内 `#eng-controls`/fg 四件套/data-rule 六件套/data-site 十开关/`#ui-fontsize` 全部在位；`--font-size` 已应用；`main[data-preview]` 存在；控制台零报错。

- [ ] **Step 3: 真机过目（用户配合）**

用户打开真实选项页过目 + 点玩（大开关/席位切换/色温滑杆/高级展开）；重载扩展后首屏与预览一致。

- [ ] **Step 4: 文档收尾**

MILESTONES 追加记录（M3+ 迭代①：选项页重设计，grilling 九裁决 + 设计稿 + 5 任务流水线 + 验收证据一行）；BACKLOG「设置过于复杂」条目移入「已完成」；progress.md 记账。

- [ ] **Step 5: Commit**

```bash
cd /Users/zero/Project/chromeStore
git add dark-mode/nightveil/docs/MILESTONES.md dark-mode/nightveil/docs/BACKLOG.md
git commit -m "docs(m3+): options redesign iteration closed — evidence and backlog move"
```

---

## Self-Review 记录

- **覆盖对照**：grilling 裁决——Q1 账目（M3+ 独立迭代，本计划即新账）✓；Q2 替换式单视图（Task 3/4 一套结构）✓；Q3 首屏五组（Task 3）✓；Q4 站点卡片（Task 3 要点 5）✓；Q5 中文化（Task 2 全表）✓；Q6 暗色自设计（Task 1 tokens 移植）✓；Q7 纯 DOM（Task 3/4 既有件复用）✓；Q8 纯 UI 层（Global Constraints 钉死 + nv-state 唯一新 id）✓；Q9 设计稿先行（已认可，93ee8b6）✓。
- **占位符扫描**：Task 3 Step 3 为「完整函数骨架 + 七条钉死语义的展开要点」——这是 DOM 渲染代码在无 jsdom 单测项目里的等效完整度（每条语义可独立验收）；strings 表为全键映射 + 风格规则兜底（补齐清单需在 report 列出）。其余任务代码完整。
- **类型一致**：SEAT_CARDS.themeId 值域 = ['adaptive','classic','custom']；nv-state ↔ settings.state；sectionOpen 新键 {advanced} 与 settings 测试一致。
