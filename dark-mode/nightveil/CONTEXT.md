# NightVeil

NightVeil（夜纱）是一个把网页整体转为暗色外观的浏览器扩展，功能复刻自某个 Dark Mode 扩展，但代码与视觉资产全部重新实现。本文件是术语表，只定义概念，不记录实现细节。

## Language

### 产品与状态

**Global State（全局状态）**:
插件级开关，取值 Light（关闭暗色）或 Dark（开启暗色）。工具栏点击即切换。
_Avoid_: mode, theme state

**Per-site Exclusion（站点排除）**:
把某个域名加入永不生效清单的动作。
_Avoid_: whitelist entry（方向相反，易误导）

### 主题体系

**Classic Theme（通用主题）**:
与具体网站无关的一整套暗色样式，由 Palette 参数驱动生成。共 40 个。
_Avoid_: general theme, dark_N

**Palette（调色板）**:
生成一个 Classic Theme 所需的全部参数（颜色、亮度、滤镜系数）。
_Avoid_: skin, style

**Overlay family（覆盖式主题族）**:
用颜色覆盖规则实现的 Classic Theme 分支，26 个。
_Avoid_: class a

**Invert family（反色式主题族）**:
用反色滤镜加保护名单实现的 Classic Theme 分支，14 个。
_Avoid_: dark invert, class b

**Site Theme（站点主题）**:
针对特定网站手工编写的选择器级暗色样式。
_Avoid_: custom theme（易与用户自写样式混淆）

**User CSS（用户样式）**:
用户在设置页自行编写并存档的暗色 CSS。
_Avoid_: custom dark

**Adaptive Engine（自适应引擎）**:
运行在页面内、遍历页面样式表并实时改写颜色的动态引擎。对应原版的 "Native Dark"。
_Avoid_: native dark, live engine

### 生效边界

**Exclusion List（排除列表）**:
永不应用暗色的域名清单。
_Avoid_: blacklist, whitelist

**Inclusion Mode（包含模式）**:
反转逻辑——仅对列表内域名应用暗色，其余站点全部忽略。
_Avoid_: inclusive mode, allowlist mode

**Per-site Toggle（站点级切换）**:
Inclusion Mode 下的一种行为：工具栏按钮变为"把当前域名加入/移出 Inclusion List"。
_Avoid_: toggleaction（原版选项名）

**Exclusion Rule（排除规则）**:
基于页面信号（cookie、属性、类名、背景亮度、color-scheme 声明等）判定该页是否跳过暗色的规则。
_Avoid_: exception

### 辅助功能

**Flash Guard（防白闪）**:
暗色就绪前先施加的临时暗样式，避免白底闪现。
_Avoid_: temporarily dark style

**Color Temperature（色温）**:
Global State 为 Light 时叠加的 RGBA 护眼滤镜。
_Avoid_: night light, f.lux

**Schedule（定时）**:
每日固定时间自动开/关 Global State。

### 工程

**Milestone（里程碑）**:
交付节奏。M1 骨架与经典主题；M2 自适应引擎；M3 完整选项。
_Avoid_: phase, sprint

**Fixture（验收页）**:
tests/fixtures/ 下托管于 localhost 的代表性页面，是每轮验证的主验收场。
_Avoid_: test page（与真实站点抽查区分）

**Backlog（待办池）**:
复刻完成后才处理的问题与增强清单，见 docs/BACKLOG.md。
_Avoid_: todo list
