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

## 未来增强（可选）

- [ ] 图标小尺寸优化：16/32px 下月牙偏"厚实"、辨识度一般，可为小尺寸用加粗几何变体（M0 视觉抽查结论 2026-09-09）。已知成因：边缘像素未做颜色混合——`aMoon > 0` 即取纯月牙色而 alpha 取 `max(aPlate, aMoon)`，1/16 月牙覆盖的边缘像素渲染为纯月牙色而非混合色（T2 审查 Minor #1）
- [ ] popup 快捷面板（临时关闭 1 小时 / 当前站点排除按钮）
- [ ] 中文语言包（文案已集中管理，补 locales 文件即可）
- [ ] Firefox / Edge 兼容
- [ ] 主题导入导出

## 已完成

（暂无）
