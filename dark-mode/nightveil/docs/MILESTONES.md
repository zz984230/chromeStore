# 里程碑跟踪（Milestones）

> 状态图例：⬜ 未开始 ｜ 🟨 进行中 ｜ ✅ 已验收（/tabbit 逐条通过）｜ ⏸ 暂停
> 变更纪律：任务只能从上级拆出或追加于「追加记录」节；验收标准变更需同步更新自主迭代.md 的里程碑条目。
> 总览最新更新：2026-09-13

## 总览

| 里程碑 | 范围 | 状态 | 验收轮次 |
|---|---|---|---|
| M0 | 文档与项目骨架（本表、ADR、协议、目录、构建链） | ✅ | /tabbit 1 轮通过（含 1 次人工加载扩展） |
| M1 | 骨架 + 经典主题 + 生效边界（伞行，见 M1a/M1b） | ✅ | M1a ✅ / M1b ✅（2026-09-13，含四页冒烟回归） |
| M1a | 核心切换与主题引擎 | ✅ | /tabbit 1 轮 + 验收迭代 1 次；终审 With fixes 当日闭环；**+ 9 波实战加固（2026-09-11/12，B 站/新浪灰度）** |
| M1b | 生效边界与选项页 | ✅ | /tabbit 分段验收（fixtures/选项页真机/真实站点/四页冒烟）+ 终审 |
| M2 | 自适应引擎（伞行，见 M2a/M2b/M2c） | ⬜ | — |
| M2a | 引擎核心（颜色库 + 遍历改写 + 变量 + 模式接入） | ⬜ | — |
| M2b | 动态性（两种变更追踪模式 + 重扫调度） | ⬜ | — |
| M2c | 配置面（30+ 子选项 + 第 IV 分区 + 映射表） | ⬜ | — |
| M3 | 完整选项（色温/防白闪/定时/用户样式） | ⬜ | — |
| M3+ | Backlog 消化（站点补齐、差评修复、增强） | ⬜ | — |

---

## M0 · 文档与项目骨架

- [x] 目录结构与 .gitignore（src/ extension/ tests/ docs/）
- [x] package.json + esbuild 构建脚本（build / watch / fixtures 三命令）
- [x] manifest.json 骨架（权限对齐原版：storage、contextMenus、host `<all_urls>`、optional alarms）
- [x] 图标初版（程序化自绘 light/dark 两套，16/32/48/64/128）
- [x] 最小可加载空壳（content.js / background.js / options.html 占位）通过 /tabbit 加载验证

**验收**：chrome://extensions 无报错加载；自主迭代.md 通用条目 1~3 通过。
✅ 2026-09-09 通过。证据：①卡片无 Errors——用户人工确认（workspace 拦 chrome:// 无法截图）；②content script 注入——tabbit 断言 `[NightVeil] content script active` 且 pageErrors=[]；③SW 无报错——卡片证据覆盖（SW debug 行在隔离 context 不可捕获）；④options 渲染——同一构建产物经 fixtures 服务 http 挂载断言标题/说明文案；⑤`npm test` 4/4。

## M1 · 骨架 + 经典主题 + 生效边界

**功能**（标注 🅰 = M1a 已验收交付；🅱 = M1b 范围）
- [x] 🅰 工具栏点击全局切换 Light/Dark；图标 + 标题随状态更新（含 onStartup 重启同步；"全 tab 同步"的逐 tab 域名区分部分依赖 M1b Inclusion Mode）
- [x] 🅱 右键菜单：按状态显示 Exclude / Include（行为忠实原版；"Exclude from Color Temperature" 入口属 M3 色温功能，M1 不做）
- [x] 🅰 参数化调色板引擎：Overlay 基础样式 + Invert 基础样式（ADR-0002）
- [x] 40 个 Classic Theme（26 Overlay + 14 Invert）——引擎与编译 M1a 已验收；M1b 交付选项页单选 UI + 实时换主题
- [x] 🅱 10 个 Site Theme（google、github、wikipedia、stackoverflow、reddit、amazon、facebook、instagram、twitter、bing），默认全开
- [x] 🅱 Exclusion List（域名）+ Exclusion Rules（属性/类名/cookie 检测；meta color-scheme；暗背景亮度阈值）
- [x] 🅱 Inclusion Mode + Per-site Toggle
- [x] 🅱 options.html 七分区框架（I 主题 / II 选项 / III 用户样式占位 / IV 引擎占位 / V 排除 / VI 包含 / VII 定时占位）+ 自动保存 + Reset
- [x] 🅰 防白闪基础版（Flash Guard：默认简单暗样式 + 200ms 延迟）
- [x] 验收 fixture 页 6 张 + localhost 托管——plain + media / frames / vars / native-dark / heavy
- [x] 🅰 文案单源断言测试（manifest + options.html 双锁定，`fa0174e` 加宽至 options.html）
- [x] 🅱 fixtures 服务路径遍历回归断言（如 `/..%2fpackage.json` → 403）钉进测试（2026-09-09 终审遗留）

**验收**：自主迭代.md 通用条目 1~4 + 里程碑条目 5~8；收尾真实站点抽查（github.com、wikipedia.org、stackoverflow.com 各截图对比）

**M1a（2026-09-10 完成子阶段）**：核心切换与主题引擎已验收。覆盖条目：工具栏切换+图标标题（标题/图标以 toggle 生效 + SW 无错为证据，工具栏像素本身不可从 workspace 断言）、参数化引擎（Overlay+Invert）、40 主题编译、Flash Guard 基础版、文案单源、plain fixture。验收证据：①用户两次重载卡片无 Errors；②tabbit：dark 即时生效（不刷新）+ 持久化 + guard 200ms 移除 + 压平背景（probe `#1e2229`、input `#2b303a`、button `#262b33`、cite `#82d4a4`）；③light 还原（nv-classic/nv-guard 双移除 + 持久化）；④`npm test` 15/15。验收迭代 1 次：overlay 未压平元素背景（浅字白底不可读）→ `d2d6fab` 修复后复验通过（T3 审查 Minor #5 实证升级为缺陷的案例）。

**M1a 实战加固（2026-09-11/12，用户灰度 B 站/新浪触发，9 波修复全部当日闭环）**：
| 波 | 问题 | 修复（commit） |
|---|---|---|
| 1-3 | B 站小窗黑屏 / 卡片数据条变实心条 | 媒体舞台标记：video 同宽祖先链（`a882fd9`）、window load 补标记（`e4493de`）、img 封面同宽同高链（`487a978`） |
| 4 | 边框视觉消失（描边对比度 ΔL≈10） | 26 调色板 border 提亮至 ΔL≥17.5 + 回归测试（`0949579`） |
| 5-6 | 新浪文字发虚/消失（站点 `!important` 抗命 + 浅色背景图幸存） | 背景图扑杀（舞台豁免）+ 颜色规则 ID 级特异性（`ae2dc9f`→`2727df8`） |
| 7-8 | 图截文字（2008 年代 IR：text-indent 流放 / font-size:0 归零） | 双式藏字召回（`f29b7d2`、`9049a8f`） |
| 9 | B 站首页全黑（全屏透明布局层被压平成不透明幕布） | markFullscreenOverlays（`7f7b22a`） |
测试 15→16；衍生能力（媒体舞台/全屏覆盖层/藏字召回/ID 特异性）为 M2 自适应引擎铺路；已知局限与流程教训（视觉验证、复现前重生成 CSS）见 Backlog 与台账。

## M2 · 自适应引擎（Adaptive Engine）

> 2026-09-13 grilling 敲定：拆 M2a/M2b/M2c 三段交付；任务 0 行为清单建档先行，建档审定前不写实现代码；关键架构决策见 ADR-0004。

**功能**（按段拆分，原六项功能全部保留、归入各段）
- [ ] 任务 0（M2a 内先行）：行为清单建档——允许通读原版源码提炼**纯行为描述**，产出行为清单 + 原选项↔新选项映射表，经用户审定后「关门」（程序见 ADR-0003 附录）。确认清单见下节。
- [ ] M2a：样式表遍历 + 颜色改写核心（桶分类 + `var(--nv-*)` 间接层，ADR-0004）；自写最小颜色数学库（现代语法跳过，见 BACKLOG）；18 个 `--nv-*` 变量与原版 `--native-dark-*` 1:1；跨域样式表 background SW 代取；模式切换接入（settings 加 `coloringMode` 字段，Classic/Adaptive 正交，Site Theme 照常叠加）
- [ ] M2b：MutationObserver / PerformanceObserver 两种变更追踪模式 + 重扫调度（语义分工见 ADR-0004；媒体舞台标记**不**并入）
- [ ] M2c：30+ 子选项逐项 1:1 对等 + 映射表交付（ADR-0003）；options.html 第 IV 分区完整实现（30+ 子选项 UI）

**任务 0 确认清单**（grilling 期间挂起的行为细节，建档时逐项落定）
① 模式选择语义：正交模式 vs 第 41 个主题（**首要**，grilling D2 工作假设为正交）② 30+ 子选项的名称/默认值/映射 ③ 18 个变量的语义枚举与 `--nv-*` 命名 ④ 两种 observer 模式的原版选项名与默认值 ⑤ 跨域样式表的原版行为（若原版直接跳过，砍除 SW 代取链路）⑥ Flash Guard 在引擎模式下的行为 ⑦ 特异性博弈机制（原版如何保证改写胜出，M1 的 ID 级提升器可复用与否）⑧ 内联 `style` 属性颜色改写与否 ⑨ 原版颜色解析格式面（定自写颜色库范围）⑩ 性能旋钮（重扫延迟等）是否在 30+ 选项内

**验收**：M2a——vars.html 逐项断言 + plain/media M1 回归不破；M2b——heavy.html 动态断言（动态插入样式表后 ≤1s 轮询确认改写完成，性能数值记录不硬断）；M2c——第 IV 分区逐项对照行为清单 + 真实站点抽查（**新浪财经、知乎、MDN**，均不在 10 站点主题清单内，测引擎裸能力）

## M3 · 完整选项

**功能**
- [ ] Color Temperature（RGBA 滤镜 + 排除域名 + 右键入口）
- [ ] Flash Guard 完整版（brightness / hide / simple dark 三模式 + 延迟 + 重页面阈值）
- [ ] Schedule（每日定时开/关，alarms）
- [ ] User CSS 编辑器（textarea + 行为提示，对应原版 behave.js 的编辑体验可简化）
- [ ] 样式防删监测（checkstylesheet 对等项）、documentroot 选项、nativerecheck 延迟
- [ ] 选项字体大小设置

**验收**：II / III / V / VI / VII 分区逐项对照行为清单；全量回归（tests/）通过

---

## 追加记录

> 新增任务按日期追加于此，不改动上方已验收内容。

- 2026-09-08：建档。
- 2026-09-09：M0 全分支终审通过（Ready to merge: Yes，0 Critical / 1 Important / 5 Minor；Important 与代码类 Minor 已当日修复）。M1 规划需注意两条：①"文案只能来自 strings.js"约束的范围要澄清——manifest/options.html 等静态文件无法 import JS 模块，建议把约束限定为"src/ 运行时文案"，并在 M1 加一条 `manifest.name === STRINGS.extensionName` 之类的单源断言测试；②fixture 套件扩到 6 页时补一行路径遍历回归断言（如 `/..%2fpackage.json` → 403），把安全守卫钉进测试。
- 2026-09-10：M1a 终审通过（With fixes，两条 Important 当日修复：description 文案抄袭重写、onStartup 图标同步）。M1b 计划需注意：①invert 家族目前零运行时验证，M1b 基线须加一条 invert 主题的 tabbit 断言；②验收清单加"浏览器重启后图标仍同步"步骤（扩展重载≠浏览器重启）；③guard 颜色硬编码为 nv-simple bg，主题可切换后需按当前 palette 取值；④M1b 引入第二写者（options 页）后，falsy-newValue 丢弃与读-改-写竞态两条台账注记需重新评估。
- 2026-09-11/12：用户真实灰度触发 9 波缺陷修复（B 站小窗/数据条/首页全黑、边框消失、新浪文字发虚/消失/图截文字），全部根因定位→修复→审查→用户验证闭环，详见 M1a 节"实战加固"表。附带流程教训两条入台账：①验证必须含视觉确认（计算样式会漏 text-indent/伪元素）；②复现前必须从 src 重新生成编译产物（过期 CSS 导致两轮无效复现）。M1b 计划吸收：验收清单加入"新浪行情页+B 站首页/空间列表/播放页"四页冒烟（本轮灰度覆盖过的页面转为回归基线）。

**M1b（2026-09-12/13 完成子阶段）**：生效边界与选项页全部交付。12 任务子代理流水线（实现+双审+5 个修复波，计划级缺陷 4 个：阈值 0 折半、darkBackground 自测注入色、逗号分组选择器逃逸特异性提升器、站点层禁用残留；皆已修复并回写计划）。验收证据（/tabbit 分段 + 用户配合）：①fixtures 六页——plain/media/frames（含嵌套帧与 about:blank）/vars/heavy 着色正确，native-dark 被规则跳过（零注入、原生暗色保留），Light 拆除干净；②主题——Midnight 实时切换+持久化，**Invert Balanced 运行时断言**（html filter `invert(1) hue-rotate(180deg) brightness(1.05) contrast(1.05)`，M1a 遗留闭环）；③边界——Exclusion/Inclusion/右键 Include（幂等）/per-site 工具栏（全局状态不误切）/Reset 全链路；④**浏览器重启图标同步**（M1a 遗留闭环）；⑤真实站点——github（header 选择器当场调优 `ee08440`，复验 `rgb(1,4,9)`）、wikipedia、stackoverflow（顶栏 `#2d2d2d` 精修层生效）；⑥四页冒烟——B 站首页（89 舞台标记，无全黑）/空间列表（切换重渲染后 0→123 标记、渐变恢复；SPA 晚挂载为 BACKLOG 已知局限，非回归）/播放页（播放器标记+控制栏可见）/新浪行情（红绿语义保留、整页可读）。测试 16→36；选项页 http 挂载预览态（D8）由控制器直接断言通过。

- 2026-09-13：M2 grilling（/grill-with-docs）敲定设计基线：①任务 0 行为清单建档先行——通读原版源码提炼纯行为、用户审定后关门（ADR-0003 附录）；②引擎架构——isolated content script 运行 + 跨域样式表 background SW 代取 + 自写最小颜色库 + 桶分类 var() 间接层（ADR-0004）；③拆 M2a/M2b/M2c 三段；④媒体舞台标记不并入变更追踪；⑤现代颜色语法与 adoptedStyleSheets 局限入 BACKLOG；⑥真实站点抽查定新浪财经/知乎/MDN（无站点主题覆盖，测引擎裸能力）；⑦动态断言用 ≤1s 轮询、性能数值记录不硬断。
