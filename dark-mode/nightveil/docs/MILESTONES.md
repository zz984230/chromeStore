# 里程碑跟踪（Milestones）

> 状态图例：⬜ 未开始 ｜ 🟨 进行中 ｜ ✅ 已验收（/tabbit 逐条通过）｜ ⏸ 暂停
> 变更纪律：任务只能从上级拆出或追加于「追加记录」节；验收标准变更需同步更新自主迭代.md 的里程碑条目。
> 总览最新更新：2026-09-10

## 总览

| 里程碑 | 范围 | 状态 | 验收轮次 |
|---|---|---|---|
| M0 | 文档与项目骨架（本表、ADR、协议、目录、构建链） | ✅ | /tabbit 1 轮通过（含 1 次人工加载扩展） |
| M1 | 骨架 + 经典主题 + 生效边界（伞行，见 M1a/M1b） | 🟨 | M1a ✅ / M1b 未开始 |
| M1a | 核心切换与主题引擎 | ✅ | /tabbit 1 轮 + 验收迭代 1 次（overlay 压平修复）；终审 With fixes 当日闭环 |
| M1b | 生效边界与选项页 | ⬜ | — |
| M2 | 自适应引擎（Adaptive Engine） | ⬜ | — |
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
- [ ] 🅱 右键菜单：按状态显示 Exclude / Include（行为忠实原版；"Exclude from Color Temperature" 入口属 M3 色温功能，M1 不做）
- [x] 🅰 参数化调色板引擎：Overlay 基础样式 + Invert 基础样式（ADR-0002）
- [ ] 40 个 Classic Theme（26 Overlay + 14 Invert）——🅰 引擎与 40 主题编译已验收（单测全覆盖）；🅱 选项页单选 UI 待做，主题当前固定为默认 Evening
- [ ] 🅱 10 个 Site Theme（google、github、wikipedia、stackoverflow、reddit、amazon、facebook、instagram、twitter、bing），默认全开
- [ ] 🅱 Exclusion List（域名）+ Exclusion Rules（属性/类名/cookie 检测；meta color-scheme；暗背景亮度阈值）
- [ ] 🅱 Inclusion Mode + Per-site Toggle
- [ ] 🅱 options.html 七分区框架（I 主题 / II 选项 / III 用户样式占位 / IV 引擎占位 / V 排除 / VI 包含 / VII 定时占位）+ 自动保存 + Reset
- [x] 🅰 防白闪基础版（Flash Guard：默认简单暗样式 + 200ms 延迟）
- [ ] 验收 fixture 页 6 张 + localhost 托管——🅰 plain 已交付；🅱 补 media / frames / vars / native-dark / heavy 五张
- [x] 🅰 文案单源断言测试（manifest + options.html 双锁定，`fa0174e` 加宽至 options.html）
- [ ] 🅱 fixtures 服务路径遍历回归断言（如 `/..%2fpackage.json` → 403）钉进测试（2026-09-09 终审遗留）

**验收**：自主迭代.md 通用条目 1~4 + 里程碑条目 5~8；收尾真实站点抽查（github.com、wikipedia.org、stackoverflow.com 各截图对比）

**M1a（2026-09-10 完成子阶段）**：核心切换与主题引擎已验收。覆盖条目：工具栏切换+图标标题（标题/图标以 toggle 生效 + SW 无错为证据，工具栏像素本身不可从 workspace 断言）、参数化引擎（Overlay+Invert）、40 主题编译、Flash Guard 基础版、文案单源、plain fixture。验收证据：①用户两次重载卡片无 Errors；②tabbit：dark 即时生效（不刷新）+ 持久化 + guard 200ms 移除 + 压平背景（probe `#1e2229`、input `#2b303a`、button `#262b33`、cite `#82d4a4`）；③light 还原（nv-classic/nv-guard 双移除 + 持久化）；④`npm test` 15/15。验收迭代 1 次：overlay 未压平元素背景（浅字白底不可读）→ `d2d6fab` 修复后复验通过（T3 审查 Minor #5 实证升级为缺陷的案例）。

## M2 · 自适应引擎（Adaptive Engine）

**功能**
- [ ] 样式表遍历 + 颜色改写核心（对应原版 native.js 的能力面，代码全新）
- [ ] 颜色数学库自写或引入开源库（替代原版 tinycolor，见 ADR-0001 边界）
- [ ] 30+ 子选项逐项 1:1 对等 + 「原选项 ↔ 新选项」映射表（ADR-0003）
- [ ] 18 个 `--nv-*` CSS 变量与原版 `--native-dark-*` 一一对应
- [ ] 变更追踪：MutationObserver 与 PerformanceObserver 两种模式
- [ ] options.html 第 IV 分区完整实现（30+ 子选项 UI）

**验收**：vars.html / heavy.html 逐项断言（颜色改写正确性、深嵌套规则、性能选项效果）；真实站点抽查 2~3 个样式复杂站

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
