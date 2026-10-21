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

- 测试对账:统一 `node --test --test-isolation=none` 全量绿 **302/302**(终审修复波 `2fd4640` 后;修复波前 301/301),分包计数 veil 218 + pace 71 + shell 13 = 302。基线对账:nightveil 224(unit 223 + build 1)+ video-acc 73 = 297 为起点——−2(strings-source 3 条废弃、壳版 1 条重生)、−2(icons:NV 2 条 + VA gen-icons 2 条合并为壳版 gen-icons 2 条)、+8 净新增(registry 1 + manifest 4 + store 3)= **301**,终审修复波再 +1(engine WAR 防漂移钉子)= **302**;build 1→1 与 server 1→1 同额换手(server 随 Task 11 回归 veil 套件,路径遍历 403 安全钉子在场)。
- 构建产物(`npm run build` → `extension/`):5 个 entry(background.js、popup.js、options.js、tools/veil/content.js、tools/pace/content.js)+ 装配 manifest.json + public 资产(popup.html、options.html、tools/{veil,pace}/ 静态含 nv-shadow-hook.js 与 content.css)+ 章鱼图标 15 张 PNG(三盘 toolbar/dark/light × 16/32/48/64/128)。
- 两处显式偏移(计划 Self-Review 已披露):壳六件套中「消息路由」收敛为命名空间预留(两族消息不相交,ADR-0002 已载,不建空转代码);「文案聚合」服务与 pace 散落文案收纳推迟 M1(M0 无消费者)。勾选「壳六件套」「pace 移植」以此注记为准。
- 真机过目:**通过(2026-10-18 回执)**——7 项清单(计划 Task 13 Step 5)全过;随回执的刺与修复波:面板配色统一 `355d4d3`,tab 名/页脚/pace 设置入口 `ef6128b`+`58c814a`+`17a8f7b`(2A–2D),章鱼标记 v5 重制 `578de76`(贝塞尔弧腿+外卷勾,椭圆大眼),启动菜单撞 id 自愈 `f3fac2b`,工具栏动态图标三盘入夜与金 `f80979e`(veil 关=金盘夜章鱼/开=夜盘金章鱼,setIcon 状态真话化保留)。**M0 关账。**

## M1 设计迭代(稿先行)
- [x] 设计稿:options 侧边栏 IA(夜幕/倍速/通用)、popup 壳润色 → 用户过目(**2026-10-18 通过**,稿存 docs/design/m1-mockup.html;「数据管理」三钮保留;章鱼三盘精修已随 M0 修复波提前交付:v5 弧腿卷梢 + 夜与金三盘,见 M0 验收记录)
- [x] 实现与评审(**2026-10-18 关账,真机过目 5/5 通过**)——实现波 `966340b`(壳三翼+翼记忆)→`b734c4c`(倍速翼+pace 文案单源)→`6206f1d`(通用翼+veil §6.1 退役)→`f42d489`(popup 字标金线)→修复波 `eeec9a6`(heldPace 跨入口对齐)/`6be4e17`(save 门控背压)→终审顺手修 `df0b70b`(aria-hidden×5/hasOwn/pill 联动)。测试 302→**308**;计划外增补:两新翼 veil 同款 storageAvailable 预览降级(http 挂载验证惯例依赖)。终审裁定 Ready to merge(0 Critical/0 未闭合 Important);Minor 去向:M2 种子「导入数据卫生」(逐键校验/NaN/lastError/空导出/text() catch)与「导出隐私提示+翼首帧 FOUC」。

## M2 上架准备
- [x] 质量地板波(M1 种子清偿:导入逐键卫生/NaN 入界/lastError/空导出文案/导出隐私提示/翼首帧 FOUC;pace popup http 存活;顺手修 holdOnLine 叠印 ××)
- [x] 版本 1.0.0 + `npm run zip` 打包链(包根 manifest/版本三处同步/钉子测试)
- [x] 商店文案单源 listing.zh.md + 隐私政策页(仓内 docs/privacy.zh.md,GitHub 链接)
- [x] 商店截图 ×5 + 小宣传图(mock-chrome 完整模式实拍,1280×800/440×280)
- [x] 验收:全量门 + 用户真机过目(六项清单通过,**2026-10-18 关账**)
- 吸收取代 video-acc 的 store-prep 备忘(其 MILESTONES 末节三件事:版本号决策 1.0.0 ✓/商店素材 ✓/打磨→种子并入首波 ✓)

**M2 验收记录(2026-10-18 关账)**

- 实现全程 `18e090f`(设计稿)..`b60705d`(终审修波)共 11 commit(含用户手提 `d30e1b9` plans 转 ignore);测试 308→**317**;终审(opus)两轮 Ready to merge,修波 `b60705d`(listing 简述全角对齐 manifest 原文/下载路径真话化/zip 报错一行与深度点文件排除)经原审人复审闭合;实拍中顺手修 M1 带病缺陷 holdOnLine 叠印 ××(`255ecfb`)。
- 上架件:`dist/octopus-1.0.0.zip`(`npm run zip`,包根 manifest/版本三处同步)、`docs/store/listing.zh.md`(含填表对照单,截图×5)、`docs/privacy.zh.md`(仓内,GitHub 链接)、`docs/store/assets/` 六资产(mock-chrome 完整模式实拍,1280×800×5 + 440×280)。提交边界:开发者账号($5)/CWS 表单/送审为手工事项,照 listing 填表对照单执行。
- M3 种子:veil.settings 导入逐字段校验;zip 测试链失败可诊性(可选)。

## M3 对比(diff)工具
- [x] 实现与评审(SDD 流水线 8 任务,计划 docs/superpowers/plans/2026-10-18-m3-diff-tool.md;实现波 `1200f55`(grilling 立项)..`44c322a` 共 8 commit,Task 1-7 评审全清)——自研 diff 引擎(Myers + 归一化缝,ADR-0004)+ 双层护栏(尺寸/行数两态拒算)、差异块切分与块级合并、六文本处理器(排序/反向排序/去空行/去重/去首尾空格/换行换空格)、工作页(块级合并 + 撤销栈快照 + sessionStorage 会话兜底,独立工作页 ADR-0005)、壳接入第三 tab(字形 ⇄,纯启动器;DOM id `diff-` 前缀 + 命令 `open-diff` 无建议键)。测试 317→**355**;`npm run zip` 产出含 diff.js/diff.html
- 验收:真机六项(收官门,**2026-10-21 用户回执关账**;②③⑤⑥与④之换行/交换/清空由控制器 http 真浏览器冒烟实测通过,①popup 与④之文件打开由用户真机过目):
- [x] ①popup ⇄ tab 打开工作页
- [x] ②双栏粘贴对比渲染
- [x] ③块级合并→撤销→重做
- [x] ④自动换行/交换/清空/打开文件
- [x] ⑤六处理器逐个
- [x] ⑥护栏两态+F5 恢复
- 遗留:extensionDescription/listing 是否随新工具更新并重提商店,待用户裁定

**M3 验收记录(2026-10-21 关账)**

- 实现全程 `9794d65`(M2 关账)..`8fe3525` 共 9 commit(grilling 立项 `1200f55` + SDD 八任务;每任务实现者+评审双裁定,Task 8 后全分支终审)。测试 317→**355**;终审(opus)**Ready to merge,0 Critical/0 Important**;15 条累计 Minor 三分法落定(多数 DEFER 带理由、3 条 CLOSED、1 条并入真机过目),计划文件自此视为历史文物。
- 过程要笔:Task 1 实现者抓住计划参考代码中 Myers 回溯 base 符号错(D≥2 才暴露),最小修复 + 500 对随机性质校验,评审与终审两度独立复认,修正已回灌计划。
- 冒烟实证:extension/ 产物经 http 挂载真浏览器,对比/合并/撤销重做/六处理器/交换/换行/F5 会话恢复/护栏拒绝与降级两态(含公共尾裁剪)逐项实测;工作页零 chrome API 的形态裁定由此落地。
- M4 种子:JSON/YAML/TOML 归一化器(用户后续需求,含「归一化后二次护栏」留意项);GUARDS 真机校准(顺手修 strings.js 文案数字与常量单源、MAX_BYTES 实为 UTF-16 码元命名)。

## M3.5 渲染对齐(字符级高亮)
- [x] 引擎泛化与字符级适配(diffSeq/diffChars,ADR-0006)+ 配对行段标记
- [x] 渲染接线:双层红绿(行底 19%/字符块 44%)/中缝箭头/统一面板
- 验收:单测全绿 + 真机过目(与 DiffSuite 并排对照观感,**2026-10-21 用户回执关账**;机器侧 http 真浏览器冒烟先行逐项实测)

**M3.5 验收记录(2026-10-21 关账)**

- 实现全程 ab29b6d(M3 关账)..30411f0 共 4 commit(grilling 立项 01442b4 + SDD 三任务;每任务实现者+评审双裁定,全分支终审 Ready to merge,0C/0I,终审独立重跑 367/367)。测试 355→**367**;零运行时依赖保持;计划文件自此视为历史文物。
- 过程要笔:Task 1 实现者抓住计划期望值笔误(前缀裁剪后单字符替换的回溯不产生 '=' 操作,重放不变量反证),控制器与终审三度独立复认,修正已回灌计划——与 M3 的 base 符号错同型,再次印证「计划参考代码也要过实现者的手」。
- 冒烟实证:extension/ 产物 http 真浏览器——字符块双层色值(.19/.44)/扁平三联对齐/中缝箭头语义与文案单源/合并-撤销-重做/中文与 emoji 字符块/换行开关/降级态字符级归零+banner 逐项实测,hot/cold 段拼回原行逐字吻合。
- 两处计划自述偏差如约落地:锁定滚动因统一面板固有同步而取消(意图以更强形式满足);中缝箭头并排保持行对齐。
- M4 种子增补(并入 GUARDS 校准簇):diffSeq 缺省参 NaN 静默 null;CHAR_MAX 注释码点 vs 实际 UTF-16 码元(与 MAX_BYTES 同族);块预算恰好归零边界未钉测试。可选:结果区 aria-label 加 role=region。
