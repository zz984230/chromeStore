# Backlog（复刻完成后才处理）

复刻期（M1~M3）不做任何"顺手改良"，全部已知问题与增强记入本清单；M3 验收通过后按自主迭代协议逐个作为独立可验收的迭代消化。每条消化后移入"已完成"并注明轮次。

## 站点主题补齐（M1 仅交付 10/32）

原版共 32 个站点主题。M1 计划交付：google、github、wikipedia、stackoverflow、reddit、amazon、facebook、instagram、twitter、bing。

待补 22 个（建议按需求热度排序，可追加）：
- [ ] youtube（精简自写选择器，不逐行对等原版 2482 行混淆类名）
- [ ] gmail
- [ ] duckduckgo
- [ ] yahoo
- [ ] yandex
- [ ] twitch
- [ ] tumblr
- [ ] telegram (web)
- [ ] whatsapp (web)
- [ ] dropbox
- [ ] ebay
- [ ] w3schools
- [ ] play（Google Play）
- [ ] docs（Google Docs）
- [ ] drive（Google Drive）
- [ ] sites（Google Sites）
- [ ] maps（Google Maps）
- [ ] support（Google Support）
- [ ] calendar（Google Calendar）
- [ ] translate（Google Translate）
- [ ] accounts（Google Accounts）
- [ ] myaccount（Google MyAccount）

## 已知差评问题（来自 tabbit_插件负面评论整理为问题列表.md）

- [ ] 右键"Exclude from dark mode"后缺少"取消排除"入口，只能进设置页手删（原版设计缺陷，复刻期忠实保留）
- [ ] 开关状态偶发错乱（开变关/关变开）——重写后若复现则按 bug 处理，若不复现则关闭
- [ ] YouTube 等视频站不生效（依赖 youtube 站点主题补齐）
- [ ] 视频网站进度条消失（反色式主题的滤镜副作用，需加保护规则）
- [ ] 影响论坛验证码弹窗（iframe/弹层场景的排除规则）
- [ ] 52pojie.cn 等站快捷登录失效（同上，脚本注入冲突类）
- [ ] 设置过于复杂（选项 1:1 对等保留；后续可做"简洁模式"视图，高级选项折叠）

## 已知局限（忠实原版的 filter 模式固有）

- [ ] invert 家族不保护非媒体元素上的 background-image
- [ ] html 级 filter 会使 position:fixed 后代随滚动（含 svg image 保护行为简化）

## 已知局限（overlay 压平 + 媒体舞台标记，2026-09-10/11 B 站调试引入）

- [ ] 实心品牌色按钮（如 B 站蓝色"关注"、粉色药丸）被压平抹掉填充，按钮退化为浮动文字——class-a 家族固有行为（原版完全相同：`html *` 统一背景色）；根治需 M2 自适应引擎做"品牌色降暗映射"而非抹除（2026-09-12 用户报告边界消失时确认）
- [ ] 语义色同质化：涨跌红绿（新浪行情实证 10 红 + 30 绿被压平为统一浅色）、链接色丢失——信息语义随颜色一起被抹掉；根治同样属 M2 按色映射（2026-09-12 新浪调试确认）
- [ ] 品牌色描边（如充电按钮粉色 outline）被强制统一为调色板 border 色——同上属 class-a 固有；border 对比度已通过调色板提亮修复（ΔL≥14），但品牌色相仍会丢失

- [ ] 舞台恢复规则只豁免 background-color，不豁免 background-image——站点若用背景图画控制栏/封面且恰在舞台层上会丢图（M1b 若遇真例再扩规则）
- [ ] window load 之后 SPA 新插入的 video/img 要等下一次 render（切换/改设置）才标记；需持续追踪时上 MutationObserver（与 M2 引擎的变更追踪合并考虑）
- [ ] 标记启发式（video 宽 1.5× 不限高；img 封面宽 1.5× 且高 1.1×、≥80px 已加载、深度 ≤8）为 DOM 经验值，未经单测锁定（DOM 逻辑随 tabbit 验收覆盖；如复杂化可抽 shouldMark 纯函数）
- [ ] 极端布局：与图片同尺寸且含文字的包裹层（hero 图+标题同盒）会被误标为封面——文字色仍被强制为浅色，仅背景回原样，影响温和；未见真例
- [ ] 命名债：clearVideoStages 实际清理全部媒体舞台标记，下次触碰时改名 clearMediaStages

## 未来增强（可选）

- [ ] 图标小尺寸优化：16/32px 下月牙偏"厚实"、辨识度一般，可为小尺寸用加粗几何变体（M0 视觉抽查结论 2026-09-09）。已知成因：边缘像素未做颜色混合——`aMoon > 0` 即取纯月牙色而 alpha 取 `max(aPlate, aMoon)`，1/16 月牙覆盖的边缘像素渲染为纯月牙色而非混合色（T2 审查 Minor #1）
- [ ] popup 快捷面板（临时关闭 1 小时 / 当前站点排除按钮）
- [ ] 中文语言包（文案已集中管理，补 locales 文件即可）
- [ ] Firefox / Edge 兼容
- [ ] 主题导入导出

## 已完成

（暂无）
