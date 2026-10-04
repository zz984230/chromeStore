# Octopus 里程碑路线

命名体系见根 CONTEXT.md;架构决策见 docs/adr/。每个里程碑收尾执行 /tabbit 验证 + 用户真机过目。

**前置门槛**:nightveil M3+迭代②关账并推送(等用户真机过目回执)。

## M0 平台与移植
- [x] 契约与注册表(工具声明式接入;manifest 构建期装配 + 钉子测试)
- [x] 壳六件套:SW bootstrap、消息路由、存储封装(命名空间强制)、文案聚合、popup tab 壳、options 壳
- [x] veil 移植(nightveil/src → tools/veil/,shared 解体下沉,面板/五组原样)
- [x] pace 移植(video-acc/src → tools/pace/,散落文案收进 strings,shared 下沉)
- [x] 章鱼图标首切版(程序化三盘:中性/深/浅)
- [x] activeTab 去留实证(未用即剪 + 防回归断言)
- [x] 测试合流 297+ 全绿(统一 --test-isolation=none,互踩则分包脚本)
- [x] fixtures 合并(tests/fixtures/{veil,pace}/,安全守卫测试覆盖新根)
- [x] 自主迭代.md 建档(两个旧验收标准合并 + 平台级新条目)
- 验收:真机过目——tab 切换、两工具动作全对、换盘真话保留

**M0 验收记录(2026-10-04 关账)**

- 测试对账:统一 `node --test --test-isolation=none` 全量绿 **301/301**,分包计数 veil 218 + pace 71 + shell 12 = 301。基线对账:nightveil 224(unit 223 + build 1)+ video-acc 73 = 297 为起点——−2(strings-source 3 条废弃、壳版 1 条重生)、−2(icons:NV 2 条 + VA gen-icons 2 条合并为壳版 gen-icons 2 条)、+8 净新增(registry 1 + manifest 4 + store 3)= **301**;build 1→1 与 server 1→1 同额换手(server 随 Task 11 回归 veil 套件,路径遍历 403 安全钉子在场)。
- 构建产物(`npm run build` → `extension/`):5 个 entry(background.js、popup.js、options.js、tools/veil/content.js、tools/pace/content.js)+ 装配 manifest.json + public 资产(popup.html、options.html、tools/{veil,pace}/ 静态含 nv-shadow-hook.js 与 content.css)+ 章鱼图标 15 张 PNG(三盘 toolbar/dark/light × 16/32/48/64/128)。
- 两处显式偏移(计划 Self-Review 已披露):壳六件套中「消息路由」收敛为命名空间预留(两族消息不相交,ADR-0002 已载,不建空转代码);「文案聚合」服务与 pace 散落文案收纳推迟 M1(M0 无消费者)。勾选「壳六件套」「pace 移植」以此注记为准。
- 真机过目:**待用户执行**——M0 最终门,7 项清单见计划 Task 13 Step 5;回执前 M0 保持「代码关账、里程碑待验」状态。

## M1 设计迭代(稿先行)
- [ ] 设计稿:章鱼三盘精修、options 侧边栏 IA(暗色/视频倍速/通用)、popup 壳润色 → 用户过目
- [ ] 实现与评审

## M2 上架准备
- [ ] 商店素材与截图、合并权限的隐私叙事、版本号决策(建议上架定 1.0.0)
- 吸收取代 video-acc 的 store-prep 备忘
