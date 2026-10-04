// src/tools/pace/tool.js — pace 工具契约。permissions 留空:activeTab 经 grep 实证
// 为冗余(已有 <all_urls> host_permissions + 静态注入),Task 6 有防回归断言。
export const tool = {
  id: 'pace',
  manifest: {
    permissions: [],
    optionalPermissions: [],
    contentScripts: [{
      matches: ['<all_urls>'],
      js: ['tools/pace/content.js'],
      css: ['tools/pace/content.css'],
      run_at: 'document_idle',
      all_frames: true,
    }],
    webAccessibleResources: [],
    commands: {
      'pace-up': { description: '加档（步进 0.25×）', suggested_key: { default: 'Alt+Period' } },
      'pace-down': { description: '减档（步进 0.25×）', suggested_key: { default: 'Alt+Comma' } },
      'pace-normal': { description: '回正到 1×', suggested_key: { default: 'Alt+0' } },
      'hold-toggle': { description: '切换保持（记忆当前档位并自动套用到新视频）', suggested_key: { default: 'Alt+L' } },
      'intro-minus': { description: '片头跳过 -5 秒（调到大于 0 自动启用）' },
      'intro-plus': { description: '片头跳过 +5 秒（调到大于 0 自动启用）' },
      'advance-now': { description: '立即续播（手动切下一个视频，不受总开关限制）' },
    },
  },
};
