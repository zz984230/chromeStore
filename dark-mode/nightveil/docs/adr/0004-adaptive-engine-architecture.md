# 自适应引擎：isolated 运行 + SW 代取跨域样式 + 自写颜色库 + var() 间接层

M2 自适应引擎（对应原版 native.js 能力面，代码全新）的核心架构，2026-09-13 grilling 敲定。引擎需遍历 `document.styleSheets` 改写颜色，而跨域样式表的 `cssRules` 读取抛 SecurityError（隔离世界与页面主世界同样受限），这是绕不开的硬墙；颜色数学与选项传播机制是另外两个独立分叉。

## Considered Options

**跨域样式表读取**：
- **isolated content script + background SW 代取（选定）**：引擎留在隔离世界（与 M1 全部功能同构，零新增注入面），跨域表 href 经消息发给 service worker，用已有 `host_permissions: <all_urls>`（无 CORS 限制）fetch 文本回传，改写后以带 `data-nv-*` 标记的 `<style>` 落回页面。单表失败→跳过+console 记录，不炸整页。
- declarativeNetRequest 改写 CSS 响应头加 CORS 头：全局网络层副作用、规则维护复杂，放弃。
- 跟原版注入页面主世界：违反「架构全新」分层意图，且主世界读跨域表同样受限，并不解决问题。

**颜色数学库**：
- **自写最小库（选定）**：只做引擎需要的窄切片（hex/rgb/hsl/命名色解析、亮度、暗化映射），解析面随任务 0 对齐原版 tinycolor 时代的能力面；现代语法（oklch/lab/color-mix）检测到即跳过规则，进 BACKLOG。项目保持零运行时依赖。
- 引入 culori/colord：解析更健壮但引入首个运行时依赖，且现代语法改写能力超出 1:1 对等范围，验收基线反而模糊。

**选项传播机制**：
- **桶分类 + `var(--nv-*)` 间接层（选定）**：解析出的颜色按亮度/角色分类进语义桶（与 18 个 `--nv-*` 变量对应），覆盖样式表的颜色声明替换为 `var(--nv-桶名)`。选项拨动只改变量值、不重新遍历（O(1)，与 M1 实时换主题 UX 同构）。
- 内联计算最终色值：选项变更需全量重算或维护解析缓存，heavy 页面传播链路重。

## Consequences

- 18 个 `--nv-*` 变量承担双重职责：对外是 1:1 公开 API（M3 User CSS 可引用），对内是选项旋钮。
- 新增 content→SW 消息链路：SW 被杀需唤醒（M1b 已有唤醒后刷新菜单的先例模式）。
- MutationObserver 模式盯 DOM 变更（style/link 插入、style 属性改写，精确但 CPU 贵），PerformanceObserver 模式盯样式表资源加载（便宜但看不见内联与动态 style 块）——同一契约（新样式出现后约定时限内完成改写）的两种实现策略，作为用户选项暴露；`document.adoptedStyleSheets` 两者都追不到（原版同样追不到，见 BACKLOG）。
- 媒体舞台标记（M1）**不**并入变更追踪：observer 是可选模式，耦合会让舞台标记行为随引擎模式漂移；post-M3 消化时可复用 observer 基础设施。
- **范围回调条款**：若任务 0 查明原版对跨域样式表直接跳过不改写，则整条 SW 代取链路砍除（行为对等优先于能力扩展）。
