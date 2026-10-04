// src/tools/veil/tool.js — veil 工具契约(ADR-0002:manifest 构建期装配的输入)
export const tool = {
  id: 'veil',
  manifest: {
    permissions: ['contextMenus'],
    hostPermissions: ['<all_urls>'], // SW 跨域样式代取(引擎命脉)需要;pace 经实证不需要
    optionalPermissions: ['alarms'],
    contentScripts: [{
      matches: ['<all_urls>'],
      js: ['tools/veil/content.js'],
      run_at: 'document_start',
      all_frames: true,
      match_about_blank: true,
    }],
    webAccessibleResources: [{
      resources: ['tools/veil/nv-shadow-hook.js'],
      matches: ['<all_urls>'],
    }],
    commands: {},
  },
};
