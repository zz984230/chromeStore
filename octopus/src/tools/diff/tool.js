// src/tools/diff/tool.js — diff 工具契约:工作台型,无注入;manifest 仅一条命令(ADR-0005)
export const tool = {
  id: 'diff',
  workPage: 'diff.html', // 工作台型标记(CONTEXT.md 工具形态);注入型工具无此字段
  manifest: {
    permissions: [],
    optionalPermissions: [],
    hostPermissions: [],
    contentScripts: [],
    webAccessibleResources: [],
    commands: { 'open-diff': { description: '打开对比工作页' } }, // 裁定:无建议键
  },
};
