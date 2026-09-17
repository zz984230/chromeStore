// src/content/main.js — 内容脚本组装：发现 + 接线 + 浮标 + 窄消息
import { createTripWatch } from './guard.js';
import { createKeeper } from './keeper.js';
import { createChip } from './chip.js';
import { startDiscovery } from './discovery.js';
import { APPLY_PACE, PROBE_PACE } from '../shared/protocol.js';
import { formatPace } from '../shared/paceMath.js';

export function wireContent({
  runtime = chrome.runtime,
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

  startDiscovery({
    doc,
    onFound: (v) => keeper.attach(v),
    isKept: (v) => keeper.isKept(v),
    MutationObserver: MO,
    setInterval: tick,
  });

  runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.vpa === APPLY_PACE) {
      keeper.applyAll(videos(), msg.pace, { resetTrip: true, flashText: formatPace(msg.pace) }); // 用户驱动：闪浮标 + 复位熔断
      respond?.({ ok: true, pace: keeper.lastPace() });
      return;
    }
    if (msg?.vpa === PROBE_PACE) {
      respond?.({ pace: keeper.lastPace() });
    }
    // 其余消息不回应
  });

  log('[视频倍速助手] 已注入帧:', globalThis.location?.href); // 守卫取址：node 测试环境无 location
  return { keeper };
}

if (globalThis.chrome?.runtime?.id) wireContent();
