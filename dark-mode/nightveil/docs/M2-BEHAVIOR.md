# M2 行为清单（Adaptive Engine 能力面建档）

> 任务 0 交付物（ADR-0003 附录「建档关门」程序）。来源：2026-09-13 通读原版 0.5.7 源码（options.html/options.js/rules.js/common.js/inject.js/native.js/page_context/inject.js）提炼**纯行为**。
> 本文档审定关门后，M2 实现阶段以此为准，不再读原版源码。
> 「新键/新名」列为建议，最终以实现为准；映射关系本身是合同。

## 0. 十项确认清单落定

| # | 确认项 | 结论 |
|---|---|---|
| ① | 模式选择语义 | **引擎是主题命名空间的第 41 席**（dark_41），与 40 个静态主题、自定义（38）、站点主题同机制单选；**不是**正交模式开关（推翻 grilling D2 工作假设，保真度合同跟原版） |
| ② | 30+ 子选项 | 共 **38 个存储键**（含 2 个纯数值、1 个文本、1 个变量组、1 个 extra rules 文本），逐项见 §8 映射表 |
| ③ | 18 变量 | 9 色 + 9 文本，语义与默认值见 §9；注入目标 `:root, ::after, ::before, ::backdrop`；**用户可在选项页直接编辑** |
| ④ | observer 模式 | 不是一个二选一开关，而是**多个正交观察项**：元素 MO 常开；style 属性 MO（f 开才挂）；class MO（i.1 开才挂）；PerformanceObserver（m.1 开才挂，m.3 依赖它）。m.2/m.3 是另一组 radio「调优取向」 |
| ⑤ | 跨域样式表 | **不跳过**——同源直接 fetch（含 UTF-16 BOM 修正）；跨源发 href 给 SW 代取文本；字体 URL 跳过；HTML 响应丢弃；相对 url() 重写为绝对；克隆 `<style>` 作为原 `<link>` 子节点落回（跟随 media 属性与文档位置），原 link 不禁用 |
| ⑥ | Flash Guard | 引擎模式照常生效（guard 属性先挂）；移除时机三选一最早者：引擎写入首条规则后 delay 到期 / window load / 首个 longtask-self；重页面（元素数 ≥ 阈值 1000）跳过早移除等 load |
| ⑦ | 特异性博弈 | 不改原规则，**复制进引擎自有样式表**：选择器前缀 `html[nv-active]`（:root/:host 有对应形式），逗号分组逐段处理；选项 c 开则统一 `!important`，否则保留原属性优先级 |
| ⑧ | 内联 style | 选项 f 开才处理；给元素挂随机类，在引擎表写 `html[nv-active] .nv-inline-XXXX { … !important }`；仅 color / border-color / background / background-color / background-image 五类属性；内联自定义属性也进变量映射表 |
| ⑨ | 颜色解析面 | `#RGB #RGBA #RRGGBB #RRGGBBAA`、`rgb()/rgba()/hsl()/hsla()`（逗号或空格分隔、数值或百分比）、148 个命名色。其余（oklch/lab/color()/color-mix 输入侧等）判 invalid → 走 a.6 回退色路径 |
| ⑩ | 性能旋钮 | 在 30+ 内：m.2/m.3 调优取向、m.1 PO 开关、i.2 持续处理、n 深层规则、II 区 recheck 延迟、VI 阈值。无毫秒预算类数值 |

## 1. 选择与优先级语义

- 全局仍是 Light/Dark 状态机；Dark 状态下解析「当前主题」＝dark_1~41 中被勾选的一席（安装默认 **dark_41 = 引擎**——NightVeil 现默认 `nv-simple`，是否改为引擎随 M2 落地需用户拍板，见 §11）。
- **站点主题匹配优先于引擎**，按 j/k/l 三态策略（radio，默认 l）：
  - **j 尊重**：站点主题命中 → 只用站点主题（引擎在该站不跑）。
  - **k 忽略**（ignore）：引擎永远跑，站点主题全部不应用。
  - **l 仅忽略兼容款**（默认）：命中的站点若在兼容清单（google、support、accounts、myaccount、duckduckgo）→ 引擎跑、站点主题不用；不在清单 → 站点主题跑、引擎不用。
- 站点主题非引擎路径时附带通用基础样式（dark.css），但 4 个站除外（maps、amazon、youtube、facebook 只上站点样式）。
- 引擎激活同时：Exclusion List / Inclusion / 排除规则（cookie/类名/属性/meta）照常先生效；V 区暗背景排除有引擎专属变体（§7）。

## 2. 页面接管流程（Dark → 引擎）

1. **Guard**：文档可见前即在 `<html>` 挂 guard 属性（亮度降低 / 隐藏内容 / 简单暗三种之一；默认简单暗）。
2. **挂载**：向 head（或 documentroot 选项开启时 html）追加 5 个受管节点：通用 link / 站点 link / 自定义 style / **变量+基础规则 style** / **引擎输出 sheet**。变量 style 内容 = 18 变量声明 + 用户 extra rules（默认含：color-scheme、链接/已访链接/cite/mark 着色、figure:empty 透明度、img 亮度滤镜——**这段是可编辑文本，不是硬编码**）。
3. **激活**：`<html>` 挂 `nv-active` 属性 → 引擎 sheet 启用 → 观察器按 §6 配置启动 → 全量扫描 document.styleSheets。
4. **Guard 移除**（最早者）：引擎首条规则写入后 delay（默认 200ms）到期；window load；首个 longtask-self。元素数 ≥ 1000 的重页面跳过早移除。
5. **拆除**（Light/排除/切主题）：移除属性、断开全部观察器、引擎 sheet 禁用并清空、跨域克隆样式禁用、Shadow 表关闭（§5）。

## 3. 颜色改写核心契约（每条颜色声明）

按序判定（阈值均为相对亮度百分比，默认 luminance ∈ [10, 75]、alpha ∈ [10, 90]）：

1. `transparent` → `var(--nv-transparent)`。
2. 变量引用先经映射表解析（h 开时）。
3. **invalid 色**：a.6 开 → `color-mix(in srgb, <fallback> (100−t)%, transparent)`（t 默认 10）；a.6 关 → 原样保留。
4. **alpha < 10%** → 原样保留。
5. **亮度 > 75%**（或 html/body 选择器特例）→ 回退到 fallback 变量；其中 alpha<1 且「保留透明度」开 → fallback 与 transparent 的 color-mix；「近白特调」开且近白程度落在 [5,95]% → fallback 与按程度算深的色值 color-mix（程度公式：亮度超出上限的比例经 1.10 指数 × 105 强度）。
6. **亮度 ∈ (10, 75]%** → 就地调色：背景/边框 darken 10%、文字/SVG lighten 10%；判定为「亮色」（L>75% 或 (S+L)/2>75%）且方法是 darken → 加深 50%。输出为具体色值（8 位 hex）。
7. **亮度 ≤ 10%** → 原样保留（「保留暗色」开关，默认开）；纯黑恒保留；但判定为亮色 → fallback。
8. **渐变函数**：b.3 开 → 整值换 fallback；否则 b.4 开 → 前置加深层 `linear-gradient(黑 85%→75%)` 与原渐变叠合；b.5 开 → 自定义属性里的渐变同样处理。

各属性调用的 (方法, fallback)：color→(lighten, --nv-text)；fill/stroke→(lighten, --nv-ink)；background→(darken, --nv-surface)；border 系→(darken, --nv-edge)；阴影→直接替换为对应阴影变量。

## 4. 选择器改写行为（引擎表内新规则）

- 模板：`html[nv-active] <原选择器> { <prop>: <新值> }`；原规则不动。
- 逐段处理逗号分组；`::` 纯伪类段丢弃；`*` → 双写 `html[nv-active], html[nv-active] *`；`html…` → 替换前缀；`:root` → `:root[nv-active]`；`:host` 有专门形式；属性型首 token 与 html 实时属性匹配时按命中数决定是否加空格的后代形式（可能双写两种形式）。
- @keyframes（d.2 开）：整块复制进引擎表，逐关键帧改属性。
- @media/@supports（d.1/d.3 开）：改写后的规则重新包回同条件。
- 深层嵌套（n）：默认只下探一层分组规则；n 开才递归全部。
- 去重：以选择器/规则串为键的映射表；同选择器再次出现 → 更新属性值。

## 5. 样式表来源处理

| 来源 | 行为 |
|---|---|
| 同源 link/style | 直接读 cssRules 遍历 |
| 跨源 link | SW 代取文本 → 相对 url() 绝对化 → 克隆 style 挂进原 link 内 → 遍历克隆表 |
| @import | 与跨源同路径代取 |
| 内联 style（f 开） | 随机类 + 引擎表规则（§0-⑧） |
| Shadow DOM（g 开） | 主世界 hook 强制 attachShadow 为 open、标记宿主；内容脚本递归收开放 shadowRoot 的 styleSheets + adoptedStyleSheets 逐表处理；每个 shadow 配一张 adopted 引擎表收改写规则（`:host([nv-active])` 形式）；开关态同步翻转宿主属性 |
| document 级 adoptedStyleSheets | **原版追不到**（修正 BACKLOG 措辞：shadow 内的能处理，文档级不行） |
| 字体 CSS | 跳过 |
| 背景图 url | 非 Nx 尺寸后缀图：`linear-gradient(var(--nv-image-veil) ×2)` 叠加原值（html/body 伪元素改用 `filter: var(--nv-image-filter)`）；SVG data URI → 内嵌首个颜色按 fill 色重算；带 Nx 尺寸后缀（图标类）不动 |
| relative url() | 对代取表绝对化；同源表不动 |

## 6. 变更追踪与调度

- **元素 MO（常开）**：新增 link/style → 立即处理该表；m.2 取向下另触发变量重映射 + html 属性清单刷新；新增 iframe/script → m.2 取向下全量重扫。
- **style 属性 MO（f 开）**：style 属性变更含颜色类 token → 去抖后重扫内联。
- **class MO（i.1 开）**：任意 class 变更 → 去抖后全量重扫。
- **PO（m.1 开）**：paint/layout-shift 条目 → m.3 取向下 去抖重映射+属性+全量重扫；longtask 且页面隐藏 → 延迟 300ms 全量重扫；longtask-self 参与 guard 移除（§2-4）。
- **持续处理（i.2 开）**：load 后新增的带 id/class 元素（去重映射表内未见）→ 去抖全量重扫。
- **recheck（II 区）**：load 后延迟 recheckDelay（默认 0ms）请后台重推全量设置 → 重新评估排除 + 重应用。
- **防删监测（II 区 checkstylesheet）**：引擎自己的 style/sheet 被页移除 → 重挂（sheet 需从规则文本重建）。
- 一切去抖 delay = 0（即 setTimeout(…, 0) 微任务级合并）。

## 7. 排除规则交互（V 区既有 + 引擎变体）

- 排除检测时序不变：cookie/类名/属性/meta 先于一切；CSS `color-scheme: dark`（html 规则内）与 html/body 暗背景阈值检测在 load 后。
- `excludedarkbackgroundnative`（默认关）：开 → 暗背景阈值仅对引擎生效（其他主题不受此排除）。
- iframe 排除（excludeiframes）：子帧 postMessage 上报，顶层暗色状态决定是否清子帧。
- excludeincolorschemedark（默认开）：V 区全部选项仅在浏览器偏好暗色时生效。

## 8. 子选项映射表（原键 → 建议新键，默认值）

> 分组挂 `settings.engine.*`；j/k/l 合并为单字段三态。II/V 区引擎相关项一并列出（标注属区）。

| 原键 | 建议新键（engine.* 下省略前缀） | 默认 | 行为 |
|---|---|---|---|
| dark_41 | `themeId: 'adaptive'` | 原版出厂即引擎 | 引擎主题席位（IV 区主 checkbox） |
| nativeforcefont | darken.text | true | 改写 color |
| nativeforcesvgfill | darken.svgFill | true | 改写 fill |
| nativeforcesvgstroke | darken.svgStroke | true | 改写 stroke |
| nativeforceborder | darken.border | true | 改写 border*/outline* 色 |
| nativeforcebackgroundcolor | darken.background | true | 改写 background 色 |
| nativeforceboxshadow | darken.boxShadow | true | box-shadow → 阴影变量 |
| nativeforcetextshadow | darken.textShadow | true | text-shadow → 阴影变量 |
| nativeforceborderwidth | borderNeedsWidth | false | 仅显式声明宽度才改边框色 |
| nativebackgroundblend | backgroundBlend | true | 改背景色时附带 blend-mode 变量 |
| nativebackgroundrelated | preserveBackgroundProps | true | 背景图处理时保留 repeat/position |
| nativebackgroundinitial | ignoreInitialProps | true | 上项保留时忽略 initial 值 |
| nativebackgroundfallback | fallback.enabled | true | invalid 色用回退色 color-mix |
| nativebackgroundtransparency | fallback.transparency | 10 | 回退色透明度调整 % |
| nativedarkenimage | darkenBackgroundImages | true | 背景图加暗层/滤镜 |
| nativeremoveimage | removeGradients | true | 渐变背景图整值移除（→none） |
| nativeremovecolor | removeGradientColors | false | 渐变色整值换 fallback |
| nativedarkengradient | darkenGradients | true | 渐变前置加深层 |
| nativedarkenvariable | darkenGradientVariables | false | 自定义属性中的渐变同样加深 |
| nativedarkenshade | gradientShade | linear-gradient(hsla(0,0%,0%,.85), hsla(0,0%,0%,.75)) | 加深层色（文本可编辑） |
| nativepriority | highPriority | false | 引擎规则统一 !important |
| nativemediaquery | processMediaQueries | false | @media 内规则改写 |
| nativekeyframes | processKeyframes | false | @keyframes 改写 |
| nativesupports | processSupports | false | @supports 改写 |
| nativecolorful | contextAware | true | 语境感知调色总开关（关 → 一律 fallback） |
| nativecolorful-font | contextAwareTargets.text | false | 语境感知目标：文字 |
| nativecolorful-border | contextAwareTargets.border | false | 同上：边框 |
| nativecolorful-background | contextAwareTargets.background | true | 同上：背景 |
| nativecolorful-svg | contextAwareTargets.svg | false | 同上：SVG |
| nativerangelimitmin/max | alphaRange.min / .max | 10 / 90 | 透明度有效区间 % |
| nativerangethresholdmin/max | luminanceRange.min / .max | 10 / 75 | 相对亮度分界 % |
| nativeforcetransparency | preserveAlpha | true | 回退时保留原透明度 |
| nativeforcebackground | preserveDarkColors | true | 亮度低于下限的原色保留 |
| nativeforceclosetowhite | nearWhiteAdjust.enabled | true | 近白特调开关 |
| nativeforceclosetowhitemin/max | nearWhiteAdjust.min / .max | 5 / 95 | 特调生效区间 % |
| nativeforceclosetowhitepercent | nearWhiteAdjust.percent | 10 | 基准加深 % |
| nativeinline | processInlineStyles | false | 内联 style 改写 |
| nativecssstylesheet | processShadowStyles | false | Shadow DOM + 构造式样式表（含主世界 hook） |
| mapcssvariables | mapCssVariables | true | 收集页面 CSS 变量供解析 |
| nativeclassname | watchClassChanges | false | class 变更触发重扫 |
| nativecontinue | watchNewElements | false | load 后新元素持续处理 |
| nativerespect / nativeignore / nativecompatible | siteThemePolicy | 'skip-compatible' | j/k/l 三态（respect / ignore / skip-compatible） |
| nativeperformanceobserver | performanceObserver | false | PO 追踪开关 |
| nativebestperformance / nativebestpageload | tuning | 'performance' | 调优取向（performance / page-load；后者依赖 PO 且需 LongTaskTiming 支持，否则回退并提示） |
| nativedeeprules | deepRules | false | 递归全部嵌套规则 |
| nativerecheck（II） | recheck | true | load 后重检 |
| nativerechecktimeout（II） | recheckDelay | 0 | 重检延迟 ms |
| nativecssrules | extraRules | 见 §2-2 默认模板 | 引擎附加 CSS（textarea） |
| nativecssvariables | variables | 见 §9 | 18 变量值组 |
| checkstylesheet（II） | （settings 顶层既有规划） | true | 防删监测（M3 项，引擎受益） |
| documentroot（II） | （M3 项） | false | 挂载点改 html |
| excludedarkbackgroundnative（V） | （exclusionRules 变体） | false | 暗背景排除仅引擎生效（M3 项） |

## 9. 变量映射表（18 个，1:1，默认值照抄）

注入声明目标：`:root, ::after, ::before, ::backdrop`；选项页提供 9 个取色器 + 9 个文本框直接编辑。

| 原变量 | 建议新名 | 默认值 | 用途 |
|---|---|---|---|
| --native-dark-bg-color | --nv-surface | #292929 | 背景回退色 |
| --native-dark-font-color | --nv-text | #dcdcdc | 文字回退色 |
| --native-dark-link-color | --nv-link | #8db2e5 | 链接 |
| --native-dark-visited-link-color | --nv-link-visited | #c76ed7 | 已访链接 |
| --native-dark-cite-color | --nv-cite | #92de92 | cite |
| --native-dark-accent-color | --nv-accent | #a9a9a9 | accent-color |
| --native-dark-border-color | --nv-edge | #555555 | 边框回退色 |
| --native-dark-fill-color | --nv-ink | #7d7d7d | SVG fill/stroke |
| --native-dark-mark-color | --nv-mark | #003d9b | mark 背景 |
| --native-dark-opacity | --nv-figure-opacity | 0.85 | figure:empty 透明度 |
| --native-dark-brightness | --nv-image-brightness | 0.85 | img 亮度滤镜 |
| --native-dark-box-shadow | --nv-shadow-box | 0 0 0 1px rgb(255 255 255 / 10%) | box-shadow 替换值 |
| --native-dark-text-shadow | --nv-shadow-text | none | text-shadow 替换值 |
| --native-dark-transparent-color | --nv-transparent | transparent | transparent 替换值 |
| --native-dark-bg-image-color | --nv-image-veil | rgba(0, 0, 0, 0.10) | 背景图暗层渐变色 |
| --native-dark-bg-image-filter | --nv-image-filter | brightness(50%) contrast(200%) | html/body 伪元素背景图滤镜 |
| --native-dark-bg-blend-mode | --nv-blend | multiply | 背景混合模式 |
| --native-dark-scrollbar-color | --nv-scrollbar | auto | scrollbar-color |

## 10. 边界行为与已知怪癖（照抄不改）

- 图片 URL 含 Nx 尺寸后缀（如 `sprite-2x.png`）判为图标，不加暗层。
- `color: transparent` 的文字 → `font-size: 0`（图截文字反向处理）。
- `::` 开头的纯伪类选择器段直接丢弃（伪元素样式不改写）。
- 引擎表插入一律 `insertRule(…, 0)`（头部插入，后写的在更前）。
- 跨源克隆挂在原 link 内部：跟随 media、文档位置；Light 拆除时禁用而非删除。
- 重扫去重依赖「规则对象上的处理标记 = 当前属性数」，规则被页面改动后属性数变化即重处理。
- vars 映射表来源：文档根 computedStyleMap 全量 + 规则内自定义属性 + 内联自定义属性；引用链最多跟 5 层。
- state 属性同时驱动主世界 hook 脚本的 dataset（attachShadow 时即时标记新宿主的激活态）。

## 11. 拍板记录（2026-09-13 用户审定通过，本节即关门凭证）

1. **默认主题**：✅ 切换——M2a 落地时 NightVeil 默认 `themeId` 由 `nv-simple` 改为 `adaptive`，对等原版出厂即引擎；受影响的 M1 基线测试同步调整前提。
2. **变量/键名建议表**：✅ 认可 §8/§9 新名列（`--nv-surface / --nv-text / --nv-ink / --nv-edge` 风格）。
3. **BACKLOG 修正**：✅ 确认（adoptedStyleSheets 措辞已按 §5 勘正）。

**关门声明**：自本节落笔起，M2 实现阶段以本文档为唯一规格来源，不再读原版源码（ADR-0003 附录程序）。
