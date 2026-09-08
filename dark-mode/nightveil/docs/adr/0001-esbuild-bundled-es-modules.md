# 源码用 ES Modules 编写，经 esbuild 打包进 extension/

Manifest V3 的 content script 不支持 ES 模块语法（只有 service worker 可声明 `"type": "module"`）。复刻保真度边界（见 ADR-0003）要求架构与原版的"全局命名空间 + importScripts"明确区分，因此选定：`src/` 全部以 ES Modules 编写，esbuild 打包产物输出到 `extension/`（chrome://extensions 加载该目录）。esbuild --watch 增量重建在毫秒级，不拖慢 /tabbit 验证循环。

## Considered Options

- **无构建 + 经典脚本命名空间模式**：零依赖，但架构回到与原版形似的全局命名空间，违反保真度边界第 1 层，放弃。
- **vite / rollup**：配置工程过重，本项目只需"多入口 bundle + 拷静态资源"，esbuild 一行命令足够。

## Consequences

- 项目引入 `package.json` 与 node_modules（仅 devDependencies：esbuild）。
- /tabbit 验证前必须先构建（`npm run build` 或常开 `npm run watch`），已写入自主迭代协议。
