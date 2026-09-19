# M3 · 完整选项 — 设计文档

> 日期：2026-09-19 ｜ 状态：已获用户批准（brainstorming 收敛）
> 上游：docs/MILESTONES.md M3 条目 ｜ 参考实现：dmghijelimhndkbmpgbldicpogfkceaj/0.5.7_0

## 0. 已拍板决策（2026-09-19 brainstorming）

| # | 问题 | 裁决 |
|---|---|---|
| D1 | M3 启动流程 | **行为建档先行**：先产出 M3-BEHAVIOR.md，用户审定关门后才写实施代码（沿用 M2 模式；M2 建档曾拦下 2 处设计假设错误） |
| D2 | 实施拆段 | **单计划流水线**，不拆 a/b/c：六块功能彼此独立、无递进依赖，预计 8~10 任务，体量与 M2c（9 任务）相当 |
| D3 | M2 递延引擎债 | **并入 M3** 作为独立小任务清偿：keyframes 条件包裹（行为保真缺口，复用现有 conditions 机制）+ varMap keyframe-widening 注释债 |
| D4 | User CSS 编辑器 | **核心行为自写**（~50 行，不引 vendor）：Tab 软缩进（含选区缩进/退缩）+ 括号/引号自动配对 + 退格删整对。不完整对等 behave.js 1.5 |

## 1. 总体流程

```
阶段 A  M3-BEHAVIOR.md 建档 ──用户审定关门──▶ 阶段 B  writing-plans 单计划 ──▶ 子代理流水线（每任务实现+独立审查）──▶ 终审 → /tabbit 验收 → 关账
```

## 2. 阶段 A：M3-BEHAVIOR.md 建档设计

### 2.1 范围

- **色温**：RGBA overlay（`.colortemperature-overlay` 机制）+ 独立排除表 + 右键入口
- **防白闪完整版**：brightness / hide / simple dark 三模式 + 延迟 + 重页面阈值
- **定时**：alarms 每日定时开/关
- **User CSS**：注入优先级与时机 + 编辑器行为（D4 档位）
- **杂项**：checkstylesheet 防删监测 / documentroot 注入父节点 / nativerecheck 延迟
- **选项字号**：选项页字体大小设置
- **引擎债**（D3）：keyframes 条件包裹的行为对照

### 2.2 方法

通读原版对应源码，提炼**纯行为**，沿用 M2-BEHAVIOR.md 体例（选项映射表：名称/默认值/存储键/作用点 + 边缘行为）：

| 源文件 | 提取内容 |
|---|---|
| `data/content_script/inject.js` | 色温 overlay / `color-temperature` 属性 / `--colortemperature-*` 变量、guard 三模式、checkstylesheet 复挂、documentroot 注入父节点选择 |
| `lib/common.js` | 各选项默认值与存储键 |
| `data/options/options.html` / `options.js` | II/III/V/VI/VII 分区控件清单、字号实现、behave.js 挂接点（custom / nativecssrules 两处 textarea） |
| `background.js` / `lib/chrome.js` | alarms 定时语义、右键菜单第三入口（Exclude from Color Temperature） |

### 2.3 重点交互面（建档时写清并提请用户裁决的挂起项）

1. 色温层与暗色模式/引擎层的叠加关系（独立开关、独立排除表；色温排除是否影响右键菜单文案与工具栏行为）
2. 防白闪完整版三模式语义与现有 M1 基础版（simple dark + 200ms）的差异与替换路径
3. 定时触发与手动切换/浏览器重启的竞争（SW 唤醒后如何补判「当前应处哪个时段」）
4. User CSS 注入时机/特异性/与引擎表共存；防删监测的监测对象范围
5. 杂项三键（checkstylesheet / documentroot / nativerecheck）对现有注入链路的改动面

## 3. 阶段 B：实施落点（计划草图，任务级拆分以计划文档为准）

| 功能块 | 落点 |
|---|---|
| 色温 overlay 层 + 排除表 | `content/main.js` 新增层；`shared/scope.js` 复用域名匹配；`background/main.js` 右键第三入口 |
| 防白闪完整版 | 替换现有 guard 基础版（`content/main.js`），选项接 `shared/settings.js` |
| 定时 | `background/main.js` alarms（M0 已留 optional 权限）+ 选项页 VII 分区 |
| User CSS | 选项页 III 分区 + 自写编辑器行为（D4）；注入走 content 侧统一样式管理 |
| 杂项三键 + 字号 | `content/main.js` 注入父节点/复挂；`options/main.js` 字号；II 分区控件 |
| 引擎债（D3） | `content/engine/engine.js` copyKeyframesBlock 条件包裹 + varMap 注释 |

## 4. 验收标准

- II / III / V / VI / VII 分区逐项对照 M3-BEHAVIOR.md
- 全量回归：现有 162 测试全过 + M3 新增单测
- /tabbit 真机逐项断言
- 真实站点抽查（含色温叠加视觉验证，站点清单建档时定）

## 5. 非目标（复刻纪律）

- 不做简洁模式、popup 快捷面板、22 个站点主题补齐（M3+ backlog）
- 不做 behave.js 完整对等（D4 已定简化档位）
- 不做任何顺手改良（BACKLOG 规则：M3 验收后按自主迭代协议消化）
