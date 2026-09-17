# 视频倍速助手（Video Pace Assistant）

在任意网页调节 HTML5 `<video>` 播放档位的 Chrome 扩展。本词汇表同时是全项目命名体系的基准：代码中的标识符、storage 键、消息名都从这里取词，与参考插件（已 gitignore，只读）的用词刻意区分。

## Language

### 档位控制

**档位（Pace）**:
施加在某个视频上的播放倍速值，有效范围 0.07–16。
_Avoid_: 倍速、速度、speed、rate、playbackRate（后者仅指 DOM 属性本身）

**预设档位（Preset）**:
一键套用的常用档位值（如 0.5×、1×、2×）。
_Avoid_: 快捷按钮

**保持（Hold）**:
一种模式：开启后，之后出现的每个新视频自动套用记忆档位。
_Avoid_: 锁定、lock、记忆

**记忆档位（Held pace）**:
保持模式开启时所记住的档位值；保持期间再次调档会同步更新它。
_Avoid_: lockedSpeed

**守速（Pace guard）**:
当页面脚本把档位改回去时自动恢复的机制。
_Avoid_: 抗覆盖、anti-override

**熔断（Trip）**:
守速的自我保护状态：同一视频在短时间窗口内恢复次数超过阈值后停止恢复，下次手动调档时复位。
_Avoid_: 断路器、circuit breaker

### 片段与续播

**片头跳过（Intro skip）**:
配置值：视频开始播放时，若当前位置仍在其内则自动越过的秒数。

**片尾跳过（Outro skip）**:
配置值：临近结尾时提前处理的秒数——循环视频暂停在片尾前，普通视频跳到结尾以触发自然结束。

**自动续播（Auto-advance）**:
视频自然结束后，若站点未自身连播，自动查找并触发"下一节"类入口的行为。
_Avoid_: 自动下一集、next episode

### 注入与呈现

**视频发现（Discovery）**:
检测页面中 `<video>` 元素（含动态插入、iframe 内）并纳入管理的过程。

**帧（Frame）**:
content script 注入的每个文档环境——主文档或任一 iframe，各自独立执行发现与守速。
_Avoid_: 页面、tab

**浮标（Chip）**:
调档时短暂显示在页面角落的档位指示（保持模式时带 🔒 前缀）。
_Avoid_: 徽标、badge、overlay（M2 代码用 chip：`.vpa-chip`/`createChip`，与参考插件的 badge 词汇脱钩）
