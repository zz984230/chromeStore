# 里程碑跟踪（Milestones）

> 状态图例：⬜ 未开始 ｜ 🟨 进行中 ｜ ✅ 已验收（/tabbit 逐条通过）｜ ⏸ 暂停
> 变更纪律：任务只能从上级拆出或追加于「追加记录」节；验收标准变更需同步更新自主迭代.md 的里程碑条目。
> 总览最新更新：2026-09-09

## 总览

| 里程碑 | 范围 | 状态 | 验收轮次 |
|---|---|---|---|
| M0 | 文档与项目骨架（本表、ADR、协议、目录、构建链） | ✅ | /tabbit 1 轮通过（含 1 次人工加载扩展） |
| M1 | 骨架 + 经典主题 + 生效边界 | ⬜ | — |
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

**功能**
- [ ] 工具栏点击全局切换 Light/Dark；图标 + 标题随状态更新（全 tab 同步）
- [ ] 右键菜单：按状态显示 Exclude / Include / Exclude from Color Temperature（行为忠实原版）
- [ ] 参数化调色板引擎：Overlay 基础样式 + Invert 基础样式（ADR-0002）
- [ ] 40 个 Classic Theme（26 Overlay + 14 Invert），选项页单选
- [ ] 10 个 Site Theme（google、github、wikipedia、stackoverflow、reddit、amazon、facebook、instagram、twitter、bing），默认全开
- [ ] Exclusion List（域名）+ Exclusion Rules（属性/类名/cookie 检测；meta color-scheme；暗背景亮度阈值）
- [ ] Inclusion Mode + Per-site Toggle
- [ ] options.html 七分区框架（I 主题 / II 选项 / III 用户样式占位 / IV 引擎占位 / V 排除 / VI 包含 / VII 定时占位）+ 自动保存 + Reset
- [ ] 防白闪基础版（Flash Guard：默认简单暗样式 + 200ms 延迟）
- [ ] 验收 fixture 页 6 张（plain / media / frames / vars / native-dark / heavy）+ localhost 托管

**验收**：自主迭代.md 通用条目 1~4 + 里程碑条目 5~8；收尾真实站点抽查（github.com、wikipedia.org、stackoverflow.com 各截图对比）

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
