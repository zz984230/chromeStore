# M2 上架准备 设计稿

**日期**:2026-10-18 · **状态**:用户已过目批准 · **上游**:MILESTONES M2 + M1 终审两条种子 + video-acc store-prep 备忘(其 MILESTONES 末节:版本号决策/商店素材/可选打磨)

## 用户裁定(2026-10-18)

1. **种子并入 M2 首波**——质量地板先于一切上架件
2. **版本号 1.0.0**(package.json 0.1.0 → 1.0.0,随打包链)
3. **仅 Chrome Web Store,中文 listing**(不加 _locales,不双语)
4. **隐私页入仓 + GitHub 链接**(docs/privacy.zh.md,listing 填 blob 链接)

## 方案取舍(已定)

- **截图生产**:真捕获 + 轻合成。serve 起真实构建产物,mock-chrome initScript 注入(内存 storage + 真实 manifest 字面量)让 options/popup 以**完整模式**(非 0.7 透明度预览态)渲染,种子数据经 URL query 预置;chrome-devtools 按 1280×800(DPR 1)实拍。小宣传图 440×280 用 HTML 板(programmatic:夜盘 + public/icons/toolbar/128.png + 字标)实拍。夜幕**页面效果**帧(veil 引擎产物)无法在无扩展浏览器中真话复现 → 优先用用户真机补拍两帧(并入真机过目清单,可选),未提供则第 4 帧改为通用翼全景。不做手绘仿冒页效果。
- **`<all_urls>` 权限**:保持现状 + 叙事正当化(veil 任意站点生效 / pace 任意视频站发现播放器,皆只在本机页面内运行)。不改 optional host(临上架重设计注入链,违背外科手术原则)。

## 交付五件

### ① 质量地板波(种子首波)
- `parseImportFile` 逐键验形:`vpa.settings` 数值字段(pace/heldPace/introSkip/outroSkip)须有限数→pace/heldPace 经 clampPace 夹取;布尔字段(hold/skipOn/autoAdvance)须布尔;`oct.shell` 的 activeTool/activeWing 须合法值;键脏**丢键不丢包**;返回契约变更——`null`=非本扩展文件,`{}`=合法包但无可导入内容(空导出再导入给「没有可导入的数据」而非「导入失败」)。键值非对象仍是结构性拒收(null)。
- 依据:pace `loadSettings` 读侧不夹取(`{...DEFAULTS, ...stored}` 直透),脏数值会直达 stepSkip;补 `stepSkip` 非有限入参守卫(NaN→按 min 起步)。
- import/export/reset 回调查 `runtime.lastError`(失败给文案,不再盲目 reload);`file.text()` 加 catch;export 读档 lastError 守卫。
- 导出钮下补隐私提示一行(导出文件含站点名单与设置,仅存本地所选路径)。
- options 首帧 FOUC:`options.html` veil 视图硬编码 `is-on` 去除——三翼 CSS 先隐,JS 就绪显示记忆翼(空内容闪现替代错翼闪现)。
- pace popup http 存活最小对齐(模块顶 `chrome.runtime.getManifest()` 加可选链;init 载入失败→渲染默认值 + data-preview)——截图帧 ③ 与 http 挂载验证惯例共同依赖。
- 文案收进 `SHELL_STRINGS`(现有 alert/confirm 硬编码随行迁入)。

### ② 版本 1.0.0 + 打包链
- `package.json` version → 1.0.0;新增 `scripts/zip.mjs` + `npm run zip`(依赖 build):产出 `dist/octopus-1.0.0.zip`,manifest 在压缩包根,排除点文件;版本三处同步校验(package.json = manifest = 文件名)。
- 钉子测试:`unzip -l` 断言(根 manifest、五入口、图标、无 extension/ 前缀)。

### ③ 商店文案单源 + 隐私页
- `docs/store/listing.zh.md`:名称/简述(≤132)/详细说明/分类(生产力)/语言;逐权限正当性一行(storage/contextMenus/可选 alarms/`<all_urls>`);数据披露(全不勾);图形资产清单;隐私政策 URL;**填表对照单**(逐字段→值,用户照单提交)。
- `docs/privacy.zh.md` 入仓:全本地存储、零收集零遥测、唯一网络行为=veil 引擎替页面读取其自身已引用的样式表(无外发)、权限用途、导出行为、GitHub blob 链接入 listing。

### ④ 截图与宣传图
- 4 张 1280×800:①options 夜幕翼(种子:示例站点名单)②options 倍速翼(种子:1.5×/保持开)③popup 倍速面板浮于夜与金底板(360px 实拍→板合成)④通用翼(或用户真机夜幕前后对比,若提供)。
- 440×280 小宣传图 ×1:HTML 板实拍。
- `scripts/serve-fixtures.mjs` 泛化为可指定根目录(默认不变);mock-chrome 脚本 + 合成板入 `docs/store/boards/`;成品 PNG 入 `docs/store/assets/`(raw 中间帧 gitignore)。

### ⑤ 收尾门
- 全量门(npm test / build / zip / unzip 断言)+ 残留 grep(alert 硬编码、is-on)+ http 挂载目检(FOUC 消失、popup 存活)。
- MILESTONES M2 补记(扩容:种子+裁定);真机过目清单交用户——含 zip 解包加载、导入卫生手测(脏 json/空导出)、FOUC 复验、商店图目检、(可选)夜幕两帧补拍;通过后 push 关账。
- **提交边界**:开发者账号($5)/CWS 表单上传/送审=用户手工;本仓产出包+文案+资产+对照单。

## 验证与测试

- Task 1:parseImportFile 新用例(NaN/越界夹取/布尔脏/翼脏/空包/结构非对象)+ stepSkip NaN 用例;308 → 315±。
- Task 2:zip 钉子测试(新文件)。
- Task 3/4:文档完整性 grep + 资产尺寸断言(sips)+ 目检(Read 渲染 PNG)。
- 收尾:全量绿 + build + zip。

## 边界与非目标

- 不做多语言/不接 Edge;不做 CWS API 自动提交;不重构权限模型;夜幕页效果不做仿真绘制的截图。
