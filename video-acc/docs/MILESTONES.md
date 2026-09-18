# 里程碑路线（视频倍速助手）

验收标准见 `自主迭代.md`；命名体系见 `CONTEXT.md`。参考插件（`fjhefbhpidlapjcngiojjoclnfldehno/`，已 gitignore）仅作行为规格来源，代码层面全面差异化。每个里程碑收尾时执行 /tabbit 验证循环，并对照验收标准勾账。

## M1 工程骨架 ✅（2026-09-15 关闭）
- 范围：npm 工程（esbuild）、零依赖图标生成器、manifest、background/content/popup 三入口空壳
- 验收映射：#1（无报错加载）、#7 前半（service worker 启动无报错）
- 计划：[2026-09-14-m1-scaffold.md](superpowers/plans/2026-09-14-m1-scaffold.md)（3/3 任务完成，终审 Ready: Yes）
- 证据：chrome://extensions 卡片干净 + popup 渲染 0.1.0（用户确认）；保密观测试页主帧注入 debug 日志 + 0 页面异常（tabbit 自动采集）；npm test 2/2。终审 5 条 Minor 全部并入 M2 首批（次箭头断言、--accent/.hint 改名、console.info、版本号去硬编码、popup ?. 防护）
- 遗留记录：tabbit 拦 chrome://，扩展加载/卡片/popup 需人工确认（协议注记）；AliPlayer `<video>` 在主文档、无 iframe（M2 发现机制主战场）；M2 起验收证据沉淀到 docs/verification/

## M2 核心调档链路 ✅（2026-09-17 关闭）
- 范围：`paceMath`（档位数值）/ 设置存储（单键对象）/ 视频发现（MutationObserver + 兜底扫描）/ 逐视频接线（守速 + 熔断 + 换源重套）/ 浮标 / 后台命令中枢（Alt+. / Alt+, / Alt+0 三预置快捷键 + popup 消息）/ popup 调档 UI（滑块 + 预设档位）
- 验收映射：#2、#3、#7 —— 证据见 [verification/m2.md](verification/m2.md)（注入+0 异常、popup 1→2+浮标、键盘 2→2.25→1 实测时间线、截图与视觉核验）
- 10/10 任务完成；终审 With fixes → fix wave 358db99（nudge 回包真实化、store 写失败拒斥 + 判别性并发测试、词汇表 Badge→Chip、键位笔误、动画值去指纹）控制器核验通过；39/39 单测
- 遗留记录：suggested_key 对已装扩展新增 commands 不生效（商店新装不受影响）；CDP 键盘不触发扩展命令；M3 义务：并发写判别性测试（不相交字段）
- 前置：M1 关闭

## M3 保持 + 跨页同步 ✅（2026-09-18 关闭）
- 范围：保持语义（记忆档位、新视频自动套用、调档同步更新）、storage 变更监听跨标签页同步、popup 保持开关、`Alt+L`
- 验收映射：#4 —— 证据见 [verification/m3.md](verification/m3.md)（干净刷新恢复 2.02 + 🔒 浮标、换集套用 + probe 一致、关闭不干预）
- 6/6 任务完成；终审 With fixes → fix wave f38ac8f（popup 保持标签随调档刷新 + 写入安全 + 外键/保持关负向测试）控制器核验通过；51/51 单测（node v25 IPC 抖动以 --test-isolation=none 规避）
- 遗留记录：换集为整页导航（tabbit 任务页被关，live 验证借用户确认收尾）；第一轮证据污染教训已记录（无人工复验原则）
- 前置：M2 关闭

## M4 跳过 + 自动续播
- 范围：片头/片尾跳过决策与接线、自动续播打分启发式 + 指针事件序列、popup 跳过/续播区块、未预置快捷键（片头 ±5 秒、手动续播）
- 验收映射：#5、#6
- 收尾：里程碑整体并排相似度自查（对照参考源），然后进入上架准备
- 前置：M3 关闭
