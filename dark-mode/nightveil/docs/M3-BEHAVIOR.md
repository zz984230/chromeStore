# M3 行为清单（完整选项能力面建档）

> 日期：2026-09-19 ｜ 状态：**待用户审定关门**
> 上游：specs/2026-09-19-m3-full-options-design.md（D1~D4 已拍板）
> 参考实现：dmghijelimhndkbmpgbldicpogfkceaj/0.5.7_0（下称「原版」，行号均指该目录内文件）
> 通读范围：inject.js（全量）、common.js（全量）、chrome.js（全量）、config.js、runtime.js、background.js、options.js（全量）、options.html（控件面）、native.js（定向：checkstylesheet/threshold/keyframes）、inject.css（全量）

## 0. 挂起裁决项（R1~R5，审定即关门）

| # | 问题 | 原版行为 | 建议 |
|---|---|---|---|
| R1 | 色温与暗色/引擎叠加关系 | 色温是亮色态功能：dark 态渲染先无条件移除色温层；仅「包含模式未命中」的页在 dark 态下保留色温（inject.js:824/847-849）。色温排除表独立于暗色排除表；亮色态+色温开时右键菜单换成「Exclude from color temperature」（common.js:210-215） | 照抄 |
| R2 | 防白闪完整版与 M1 基础版差异 | 三模式 radio 互斥 + 延迟/阈值/action 可调；guard 仅顶层帧（frameId 0）；recheck 重渲染不重挂；CSS 见 inject.css:1-55（simple/display 两模式 html+`*` 双层规则，brightness 仅 html filter 0.25） | 照抄；simple 模式 html 背景沿用 nightveil M1 已接受的调色板感知版本（原版硬编码 #292929），`*` 级规则与另两模式字面照抄 |
| R3 | 定时与手动切换/重启竞争 | 一次性 `when` alarm（今日 HH:MM:SS，已过则 +1 天），触发即写 state（走与手动切换完全相同的 storage 传播链，config.js:4）并重排次日 alarm；手动切换**不动** alarm；无补判逻辑（错过靠 Chrome alarm 跨重启补发一次）；SW 启动/install 重建；scheduleaction 关→clearAll | 照抄 |
| R4 | User CSS 席位语义 | custom=原 dark_38（41 席 radio 之一）；选中后**只注入用户 CSS 文本**（无 dark.css 基础层，inject.js:992）；命中站点主题时站点层优先、custom 让位；保存时机 keyup 逐键 | 照抄；编辑器按 D4 档（Tab 软缩进 2 + 括号/引号配对 + 退格删整对；不做 autoIndent/overwrite/replaceTab），custom 与 engine.extraRules 两个文本域都挂 |
| R5 | 杂项三键对 nightveil 的增量 | nativerecheck/timeout **已由 M2c 交付**（engine.recheck/recheckDelay，§8 已映射，M3 仅复核控件）；documentroot=注入父节点选择（head↔documentElement，五元素统一）；checkstylesheet=引擎每次重扫前重挂被删的引擎元素至 documentElement + 规则文本恢复 | nativerecheck 判已交付；另两键照抄 |

## 1. 色温（Color Temperature）

### 1.1 选项与默认值（common.js:373-378）

| 原键 | 默认 | 控件 |
|---|---|---|
| colortemperature | false | checkbox |
| colortemperature-red / -green / -blue | 255 / 227 / 199 | range 0-255，input 事件实时存 |
| colortemperature-opacity | 100 | range 0-100 |
| colortemperature-whitelist | [] | textarea 逗号列表 |

### 1.2 内容侧行为（inject.js:245-287）

- **仅顶层窗口**（`window === window.top`）；iframe 永不染色。
- 渲染 = 幂等重建：先移除已有 `.colortemperature-overlay` + `color-temperature` 属性 + 4 个 CSS 变量，再判定；未排除则：
  - `documentElement` 置 `color-temperature` 属性；
  - 行内设 4 变量：`--colortemperature-red/green/blue`（原值直传）、`--colortemperature-opacity`（**÷100**）；
  - overlay div（class `colortemperature-overlay`）插入为 documentElement **firstChild**。
- 排除判定：`new URL(顶层页 URL).hostname` 去 `www.` 后**精确等值**比对排除表（无子域通配）。
- 状态交互：dark 态先无条件移除（render.post 首行）；亮色态（含 dark 态下被排除/未包含而保持亮色的页——仅包含模式分支会重建，whitelist/darkness 分支不建，见 §10 怪癖 1）。

### 1.3 overlay 视觉（inject.css:59-79，全部 `!important`）

`position:fixed; top:-10%; right:-10%; width:120%; height:120%; z-index:2147483647; pointer-events:none; mix-blend-mode:multiply; transition:opacity .1s; background:rgba(var(--colortemperature-red), var(--colortemperature-green), var(--colortemperature-blue), var(--colortemperature-opacity))`。选择器为 `html[color-temperature] .colortemperature-overlay`（属性在、类在才显示）。

### 1.4 右键菜单（common.js:192-226, 125-135）

亮色态 + 色温开 → 菜单仅一条「Exclude from color temperature」（顶替「Exclude from dark mode」）；点击把当前 hostname（去 www.）追加进色温排除表（去空+去重）后刷新工具栏。dark 态菜单不变（include/exclude 照旧）。`colortemperature` 键 storage 变更 → SW 刷新按钮+菜单。

## 2. 防白闪完整版（Flash Guard）

### 2.1 选项与默认值（common.js:296-301；options.html:294-318）

| 原键 | 默认 | 控件 |
|---|---|---|
| temporarilyaction | true | checkbox（总开关，关→整个 fieldset 禁用） |
| temporarilybrightness / temporarilydisplay / temporarilysimpledark | false / false / true | **同名 radio `darkstyle` 三选一**（存储为 3 个布尔，联动互斥写 false，options.js:323-336） |
| temporarilydelay | 200 | number 0-10000（ms） |
| temporarilythreshold | 1000 | number 1-1000000（元素数） |

优先级（apply 侧，inject.js:702）：brightness > display > simpledark（radio 语义下恰一真）。

### 2.2 模式 CSS（inject.css:1-55）

| 属性 | CSS |
|---|---|
| `temporarily-dark-start`（doc_start 立即垫底） | html：`color-scheme:dark; background:#292929`；`*`：`background:#292929` |
| `temporarily-dark-simple` | html：`filter:none; height:100vh; transition:none; color-scheme:dark; background:#292929`；`*`：`color:#eee; border-color:#555; background:#292929`；video/input/textarea：边框背景透明 |
| `temporarily-dark-display`（hide） | html 同 simple（无 `*` 颜色）；`*`：`display:none` |
| `temporarily-dark-brightness` | html：`height:100vh; color-scheme:dark; filter:brightness(0.25)`（无 `*` 规则） |

### 2.3 生命周期（inject.js:87-128, 681-753；native.js:1875-1891）

1. **pre**（storage 首读返回，dark + action 开）→ 置 `start` 属性（垫底暗，先于内容判定）。
2. **apply**（SW 推送内容，仅 frameId 0 且 reload=false 参与挂载）：
   - 内容全空（四处 href/text 皆空）→ **立即**移除全部 guard 属性；
   - 否则按优先级换模式属性（action 开且 **recheck 渲染不挂**）；
   - 非引擎主题（text_n 空）→ `delay` 后移除；
   - 引擎主题：**首条引擎表规则写入时**分类——`元素数 < threshold` → `delay` 后移除；否则标记 slow，留待 load。
3. **window load** 兜底：仍未移除 → `delay` 后移除（重页路径）。
4. **clear/deactivate**（frameId 0 且 reload=false）→ 立即移除；**storage 变更引发的 reload 渲染** → 立即移除（不重挂）。
5. 非 0 帧：任何路径都立即移除（guard 仅顶层帧）。
6. 移除 = 清 pending 定时器后一次性摘 4 个属性（幂等）。

nightveil 映射：常量 `GUARD_REMOVE_DELAY_MS=200`/`<1000` 判轻 → 读设置；armGuard 增加模式 CSS 三态与 action 短路；**补顶层帧判定**（现 all_frames 内容脚本各帧都会挂 guard，M1 偏差，M3 修正为仅顶层）；recheck 重渲染不重挂（现 render 幂等重挂，需按 §2.3-2 抑制）。

## 3. 定时（Schedule）

### 3.1 选项与默认值

| 原键 | 默认 | 控件 |
|---|---|---|
| scheduleaction | false | checkbox；勾选时 `chrome.permissions.request({permissions:['alarms']})`，拒绝→回退勾选+存 false+alert（options.js:387-397） |
| scheduleon / scheduleoff | '' | `<input type="time">`（HH:MM；清空=不排） |

### 3.2 SW 行为（common.js:13-55, 62-69, 180-191）

- storage 变更触及 schedule 四键 → update.alarm：action 开 → 对每个非空时间创建；关 → `alarms.clearAll()`。
- alarm 时刻 = 本地时间今日 HH:MM:00；已过则 +86400000。**一次性**（`when`），非 period。
- 触发：`dark-mode-on` → state='dark'，`dark-mode-off` → state='light'（config.js setter 直接写 storage → onChanged 全链传播：工具栏/菜单/各内容脚本重渲染，与手动切换同一链路）；随后 update.alarm 重排次日。
- onStartup/onInstalled → update.alarm（幂等重建）。
- 手动切换**不触碰** alarm（下个预定时刻照常翻转，schedule 在触发时刻具有最终权威）。

### 3.3 边界（照抄）

- 浏览器关闭期间错过 → Chrome alarm 跨重启补发一次（无自建补判）。
- on === off → 同刻两条 alarm 都触发，终态=后发者（顺序不定义）。
- 只设一端 → 只向该方向翻转，另一态保持。

## 4. User CSS 编辑器（custom 席位）

### 4.1 席位语义（inject.js:990-992）

- custom 是主题 radio 之一（原 dark_38/共 41 席）；选中且页面未被排除/未命中站点主题时 → **只注入用户 CSS 文本**（`#dark-mode-custom-style` 元素，text_c），无 dark.css 基础层、无站点层。
- 命中站点主题（策略允许）→ 站点层（dark.css + site.css）优先，custom 让位。
- 走全部既有门（scope/排除规则/包含模式/暗底检测）。
- 保存时机：textarea **keyup 逐键**存原文（options.js:528 + cond_5）。

### 4.2 编辑器行为（D4 档，对照原版 behave 配置 options.js:33-44, 619-623）

| 行为 | 原版 | nightveil M3 |
|---|---|---|
| Tab 软缩进（tabSize 2，含选区整体缩进/退缩） | ✅ | ✅ |
| 括号/引号自动配对（autoOpen） | ✅ | ✅ |
| 退格删空整对（autoStrip） | ✅ | ✅ |
| 换行继承缩进（autoIndent）/ 输入覆盖右配对符（overwrite）/ 粘贴 Tab 归一（replaceTab） | ✅ | ❌（D4 裁决不做） |

挂接对象：custom 文本域 + engine.extraRules 文本域（原版两处都挂）。

## 5. 杂项（checkstylesheet / documentroot / nativerecheck）

### 5.1 nativerecheck（+timeout）——**已交付，M3 仅复核**

原版：load 后若 recheck → 延时 rechecktimeout → SW 往返重渲染（inject.js:98-104）。nightveil M2b/M2c 已以 `engine.recheck`（true）/`engine.recheckDelay`（0）等价交付（本地重渲染替代 SW 往返，M2b 已声明等价）。M3 验收仅复核 IV 分区控件在位。

### 5.2 documentroot（默认 false，inject.js:61/376/760）

- 五个样式元素（general-link/custom-link/custom-style/native-style/native-sheet）的注入父节点：false→`document.head`，true→`document.documentElement`。
- 注入时父节点尚不存在（head 未解析）→ subtree MutationObserver 等到出现再挂并断开（inject.js:60-66, 813-817）。
- nightveil 映射：`injectStyle` 与引擎表元素父节点按设置选择；夜面当前 `head ?? documentElement` 兜底保留。

### 5.3 checkstylesheet（默认 true，inject.js:410-456；native.js:985-987）

- 触发点：**每次引擎文档表扫描**（analyze.document.sheets，含 process/clean）之前。
- 行为：引擎两元素（native.style / native.sheet）若脱离 DOM：
  - native.style → 重挂到 **documentElement**（不论 documentroot 设置，怪癖 §10-9）；
  - native.sheet → 从孤儿 CSSStyleSheet 读全部 cssText → 重写 textContent → 重挂 → 重新取 `.sheet` 引用（rAF 兜底）。规则文本恢复丢注释（cssText 拼接固有）。
- 关闭 → 跳过检测（元素被删后不自动恢复，直到下次渲染）。
- nightveil 映射：引擎重扫周期（MO/PO 触发的 scan）前置同样的自检；恢复对象为引擎自有元素（vars 表 + 引擎表）。injectStyle 的「按 id 缺失即重建」已是渲染级等价物，本项补的是**渲染间隙**（站点脚本删元素后、下次渲染前）的守护。

## 6. 选项页行为

### 6.1 字号（options.html:246；options.js:193-194）

`fontsize`：number 10-22 步进 1，默认 13；change 存字符串；应用 = `document.documentElement.style.setProperty('--font-size', value + 'px')`（选项页 CSS 以 `var(--font-size)` 取基字号）。

### 6.2 分区折叠持久化（options.js:80-84, 664-673）

七个 `<details>` 分区，summary 点击存 `{section-N: open}`；渲染时恢复。默认仅 section-4（引擎区）开。nightveil 映射到七分区（themes/options/usercss/engine/exclusion/inclusion/schedule），默认仅 engine 开。

### 6.3 列表 textarea 规整（options.js:701-741）

whitelist / colortemperature-whitelist / inclusivelist（及 cookie/exclude*）：change → 按 `/\s*,\s*/` 切分 → 每项过 hostname()（容 URL、去 www.）→ 去空+去重 → 存数组；渲染 join(', ')。V/VI 区 M1b 已有同款；M3 补色温排除表。

### 6.4 既有项复核（M3 不改行为）

Reset（confirm → 清库重写默认）、storage 同步渲染（>10 键变更 300ms 防抖）、禁用 fieldset 联动（色温/guard 开关关闭时子控件禁用，M2c D8 已有同款模式）。

## 7. 引擎债（D3）

### 7.1 keyframes 条件包裹

- **原版**（native.js:646-705, 683-712）：`nativekeyframes` 开 → 递归下降进入 @keyframes 块（顶层；嵌套时经 mediaquery/supports 开关或 deeprules），块内 keyframe 规则走 `process.action.normal` → **原位改写**原表规则。条件天然保留（块不动）。
- **nightveil 现状**（engine.js:34-37 等）：按名复制块进引擎表（每名一次），改写副本；**副本丢弃外层 @media/@supports 条件链**。
- **修复语义**：复制时以既有 conditions 机制（wrapConditional，engine.js:196-203）按原条件链包裹副本；**去重键从「名」扩为「名+条件链」**（原版原位改写无去重，同名不同条件的块各自处理；nightveil 去重是自优化，键不改会漏扫第二条条件块）。

### 7.2 varMap keyframe-widening 注释

原版变量收集同样覆盖 keyframe 规则（原位遍历喂 map.css.variables）；nightveil 从副本收集，行为等价。仅补注释说明，不改代码。

## 8. 子选项映射表（原键 → 建议 nightveil 键，默认值）

| 原键 | 建议 nightveil 键 | 默认 |
|---|---|---|
| colortemperature | `colorTemperature.enabled` | false |
| colortemperature-red/green/blue | `colorTemperature.red/green/blue` | 255/227/199 |
| colortemperature-opacity | `colorTemperature.opacity` | 100 |
| colortemperature-whitelist | `colorTemperature.excludedHosts` | [] |
| temporarilyaction | `flashGuard.enabled` | true |
| temporarilybrightness/display/simpledark | `flashGuard.mode`：`'brightness' \| 'hide' \| 'simple-dark'`（radio 三选一收敛为枚举，映射：simpledark→true） | 'simple-dark' |
| temporarilydelay | `flashGuard.delayMs` | 200 |
| temporarilythreshold | `flashGuard.threshold` | 1000 |
| scheduleaction | `schedule.enabled` | false |
| scheduleon / scheduleoff | `schedule.onTime / offTime` | '' |
| （主题席 dark_38） | `themeId: 'custom'` + `userCss: ''` | — |
| documentroot | `documentRoot` | false |
| checkstylesheet | `reattachStyles` | true |
| fontsize | `ui.fontSize` | 13 |
| section-1..7 | `ui.sectionOpen`（七布尔，仅 engine true） | 见左 |
| nativerecheck(+timeout) | `engine.recheck / engine.recheckDelay`（既有） | true / 0 |

命名可在审定时改；结构上 colorTemperature/flashGuard/schedule 各成嵌套组（settings.js 二级深合并已支持），ui.* 归一组。

## 9. 与现有功能的交互面（验收对照点）

1. 色温层 z-index 2147483647 于一切之上、multiply 混合——与暗色态互斥（R1）；与站点主题/引擎不叠加。
2. guard 模式属性在 html 上，暗色 CSS 未到时先渲染；引擎首规则/经典主题路径摘除时机不同（§2.3）。
3. 定时翻转走 saveSettings 全链——工具栏图标、菜单文案、每个 tab 的内容脚本同刻刷新（与手动切换一致的证据面）。
4. custom 席位无基础层：切换到 custom 后页面只受用户 CSS 影响（验收断言点：无 nv-classic 注入）。
5. documentRoot 开 → 全部注入元素挂 documentElement（验收断言：元素 parentNode）。
6. 引擎债修复后：@media 内 @keyframes 的颜色改写仅在条件成立时可见（窄窗对照断言）。

## 10. 边界行为与已知怪癖（照抄不改）

1. dark 态下 whitelist/darkness/newtab 分支**不**重建色温层——仅包含模式未命中分支重建（inject.js:844-853 分支结构使然）；被排除页在 dark 态无暖色。
2. 色温排除=精确 hostname（去 www.），无子域继承；与暗色排除表完全独立。
3. guard 仅顶层帧；iframe 内容脚本立即摘 guard 属性。
4. recheck 渲染不重挂 guard（防 load 后二次闪）。
5. storage 变更重渲染（reload）路径 guard 立即摘除。
6. scheduleon===scheduleoff 双触发，终态以后发者为准（不定义顺序）。
7. 错过定时靠 Chrome alarm 跨重启补发一次；无自建补判。
8. checkstylesheet 重挂目标恒为 documentElement（无视 documentroot）。
9. native.sheet 恢复用 cssText 拼接，注释丢失。
10. custom 席位命中站点主题时让位（站点层优先）。
11. 原版 guard CSS 硬编码 #292929；nightveil simple 模式 html 背景取调色板（M1 已接受偏差，M3 延续）；`*` 级规则与 display/brightness 模式字面照抄。
12. fontsize 以字符串存储、原值直拼 'px' 应用。
13. 选项页 >10 键 storage 变更 → 渲染 300ms 防抖（Reset 场景）。
14. 色温三滑杆 input 实时存（每拖动一格一写）；opacity 显示值带 '%'，RGB 显示原值。

## 11. 拍板记录

（待用户审定后填写：R1~R5 裁决 + 映射表命名认可或修改 + 怪癖清单确认。本节填写即关门。）
