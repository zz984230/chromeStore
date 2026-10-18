// docs/store/boards/mock-chrome.js — 商店截图捕获用 chrome 替身(navigate_page initScript 注入)
// 真话边界:只提供内存版 storage.local / runtime.getManifest / tabs.query;
// UI 渲染、默认值回填、写入链全部走真实代码路径。种子经 URL ?seed=<name> 选择。
(() => {
  const MANIFEST = {
    version: '1.0.0', name: 'Octopus',
    description: '工具的瑞士军刀:暗色模式与视频倍速,更多工具持续加入。',
    commands: { // 从 extension/manifest.json 的 commands 原样拷贝(npm run build 产物)
      'pace-up': { description: '加档（步进 0.25×）', suggested_key: { default: 'Alt+Period' } },
      'pace-down': { description: '减档（步进 0.25×）', suggested_key: { default: 'Alt+Comma' } },
      'pace-normal': { description: '回正到 1×', suggested_key: { default: 'Alt+0' } },
      'hold-toggle': { description: '切换保持（记忆当前档位并自动套用到新视频）', suggested_key: { default: 'Alt+L' } },
      'intro-minus': { description: '片头跳过 -5 秒（调到大于 0 自动启用）' },
      'intro-plus': { description: '片头跳过 +5 秒（调到大于 0 自动启用）' },
      'advance-now': { description: '立即续播（手动切下一个视频，不受总开关限制）' },
    },
  };
  const SEEDS = {
    // veil 种子走最小真话:state + 站点名单,字段名照抄 src/tools/veil/shared/settings.js
    // (DEFAULT_SETTINGS 的嵌套组 engine/exclusionRules/ui 等由 loadSettings 深合并回填,种子不重复)
    veil: { 'nightveil.settings': { state: 'dark', inclusionMode: false, exclusionList: ['zh.wikipedia.org', 'developer.mozilla.org', 'news.ycombinator.com'] } },
    pace: { 'vpa.settings': { pace: 1.5, hold: true, heldPace: 1.5, introSkip: 30, skipOn: true }, 'oct.shell': { activeWing: 'pace' } },
    gen: { 'oct.shell': { activeWing: 'gen' }, 'nightveil.settings': { ui: { fontSize: 15 } } },
    popup: { 'vpa.settings': { pace: 1.5, hold: true, heldPace: 1.5, introSkip: 30, skipOn: true, autoAdvance: false }, 'oct.shell': { activeTool: 'pace' } },
  };
  const store = new Map(Object.entries(SEEDS[new URLSearchParams(location.search).get('seed') ?? 'veil'] ?? {}));
  const area = {
    get(keys, cb) {
      const out = {};
      if (keys === null || keys === undefined) { for (const [k, v] of store) out[k] = v; }
      else { for (const k of Array.isArray(keys) ? keys : [keys]) if (store.has(k)) out[k] = store.get(k); }
      setTimeout(() => cb(out), 0);
    },
    set(obj, cb) { for (const [k, v] of Object.entries(obj)) store.set(k, v); setTimeout(() => cb && cb(), 0); },
    remove(keys, cb) { for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k); setTimeout(() => cb && cb(), 0); },
    onChanged: { addListener() {}, removeListener() {} },
  };
  globalThis.chrome = {
    storage: { local: area },
    runtime: { getManifest: () => MANIFEST, getURL: (p) => p },
    tabs: { query: async () => [] },
  };
})();
