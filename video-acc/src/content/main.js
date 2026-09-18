// src/content/main.js — 内容脚本组装：发现 + 接线 + 浮标 + 窄消息 + 保持模式
import { createTripWatch } from './guard.js';
import { createKeeper } from './keeper.js';
import { createChip } from './chip.js';
import { startDiscovery } from './discovery.js';
import { clampPace, formatPace } from '../shared/paceMath.js';
import { loadSettings, subscribeSettings } from '../shared/store.js';
import { APPLY_PACE, PROBE_PACE } from '../shared/protocol.js';

export function wireContent({
  runtime = chrome.runtime,
  storage,
  doc = document,
  MutationObserver: MO = globalThis.MutationObserver,
  setInterval: tick = globalThis.setInterval,
  makeChip = createChip,
  log = console.info,
} = {}) {
  const chip = makeChip(doc);
  const trip = createTripWatch({
    onTrip: () => log('[视频倍速助手] 站点持续改档，守速已熔断；下次调档自动恢复'),
  });
  const keeper = createKeeper({ trip, chip });
  const videos = () => doc.querySelectorAll('video');

  // 本帧保持快照（经 storage 总线与全局设置同步）
  let hold = false;
  let heldPace = 1;
  const holdText = (pace) => `🔒 ${formatPace(pace)}`;

  startDiscovery({
    doc,
    onFound: (v) => {
      keeper.attach(v);
      if (hold) keeper.applyAll([v], heldPace, { resetTrip: true, flashText: holdText(heldPace) });
    },
    isKept: (v) => keeper.isKept(v),
    MutationObserver: MO,
    setInterval: tick,
  });

  runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.vpa === APPLY_PACE) {
      keeper.applyAll(videos(), msg.pace, { resetTrip: true, flashText: formatPace(msg.pace) });
      respond?.({ ok: true, pace: keeper.lastPace() });
      return;
    }
    if (msg?.vpa === PROBE_PACE) {
      respond?.({ pace: keeper.lastPace() });
    }
  });

  if (storage) {
    // 启动快照：刷新/新开页时恢复保持施档（发现先于快照的竞态由这次全量兜底）
    loadSettings(storage).then((s) => {
      hold = !!s.hold;
      heldPace = clampPace(s.heldPace);
      if (hold) keeper.applyAll(videos(), heldPace, { resetTrip: true, flashText: holdText(heldPace) });
    });
    // 订阅回声：content 从不写存储，收到的都是跨上下文变更。
    // hold 开启 → 静默套用（同值施档被速率相等短路，与活动页直推幂等）；
    // hold 关闭 → 不施档（活动页已由直推处理，其余页不干预）。
    subscribeSettings((s) => {
      hold = !!s.hold;
      heldPace = clampPace(s.heldPace);
      if (hold) keeper.applyAll(videos(), heldPace, {});
    }, storage);
  }

  log('[视频倍速助手] 已注入帧:', globalThis.location?.href);
  return { keeper };
}

// 守卫式自启：node 测试环境无扩展 id 不启动；真实内容脚本有 id 才组装
if (globalThis.chrome?.runtime?.id) wireContent({ storage: globalThis.chrome?.storage?.local });
