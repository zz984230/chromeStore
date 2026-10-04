// src/tools/veil/tool.js — veil 工具契约(ADR-0002:manifest 构建期装配的输入)
export const tool = {
  id: 'veil',
  manifest: {
    permissions: ['contextMenus'],
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
