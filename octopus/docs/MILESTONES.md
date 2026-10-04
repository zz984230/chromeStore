# Octopus 里程碑路线

命名体系见根 CONTEXT.md;架构决策见 docs/adr/。每个里程碑收尾执行 /tabbit 验证 + 用户真机过目。

**前置门槛**:nightveil M3+迭代②关账并推送(等用户真机过目回执)。

## M0 平台与移植
- [ ] 契约与注册表(工具声明式接入;manifest 构建期装配 + 钉子测试)
- [ ] 壳六件套:SW bootstrap、消息路由、存储封装(命名空间强制)、文案聚合、popup tab 壳、options 壳
- [ ] veil 移植(nightveil/src → tools/veil/,shared 解体下沉,面板/五组原样)
- [ ] pace 移植(video-acc/src → tools/pace/,散落文案收进 strings,shared 下沉)
- [ ] 章鱼图标首切版(程序化三盘:中性/深/浅)
- [ ] activeTab 去留实证(未用即剪 + 防回归断言)
- [ ] 测试合流 297+ 全绿(统一 --test-isolation=none,互踩则分包脚本)
- [ ] fixtures 合并(tests/fixtures/{veil,pace}/,安全守卫测试覆盖新根)
- [ ] 自主迭代.md 建档(两个旧验收标准合并 + 平台级新条目)
- 验收:真机过目——tab 切换、两工具动作全对、换盘真话保留

## M1 设计迭代(稿先行)
- [ ] 设计稿:章鱼三盘精修、options 侧边栏 IA(暗色/视频倍速/通用)、popup 壳润色 → 用户过目
- [ ] 实现与评审

## M2 上架准备
- [ ] 商店素材与截图、合并权限的隐私叙事、版本号决策(建议上架定 1.0.0)
- 吸收取代 video-acc 的 store-prep 备忘
