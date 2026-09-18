// src/background/main.js — 命令中枢：快捷键 → 单写存储 + 推活动页
import { bumpPace, clampPace } from '../shared/paceMath.js';
import { loadSettings, saveSettings } from '../shared/store.js';
import { nudgeActiveTab } from '../shared/notify.js';

export function wireBackground({
  commands = globalThis.chrome?.commands,
  storage,
  tabsApi = globalThis.chrome?.tabs,
  version = globalThis.chrome?.runtime?.getManifest?.()?.version ?? 'dev',
  log = console.info,
} = {}) {
  if (!commands) return;
  log(`[视频倍速助手] service worker v${version} 已启动`);
  commands.onCommand.addListener(async (id) => {
    if (id === 'pace-up' || id === 'pace-down' || id === 'pace-normal') {
      const { pace } = await loadSettings(storage);
      const next = id === 'pace-normal' ? 1 : bumpPace(pace, id === 'pace-up' ? 1 : -1);
      await saveSettings({ pace: next }, storage);
      await nudgeActiveTab(next, tabsApi);
      return;
    }
    if (id === 'hold-toggle') {
      const s = await loadSettings(storage);
      const updates = s.hold ? { hold: false } : { hold: true, heldPace: clampPace(s.pace) };
      await saveSettings(updates, storage); // storage 总线广播到所有标签页
      return;
    }
  });
}

wireBackground();
