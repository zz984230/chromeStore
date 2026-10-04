// src/content/main.js — 内容脚本组装：发现 + 接线 + 浮标 + 窄消息 + 保持 + 跳过/续播
import { createTripWatch } from './guard.js';
import { createKeeper } from './keeper.js';
import { createChip } from './chip.js';
import { startDiscovery } from './discovery.js';
import { runAdvance as defaultRunAdvance } from './advance.js';
import { clampPace, formatPace } from '../shared/paceMath.js';
import { introSeekTarget, outroAction, clampSkip } from '../shared/skipPlan.js';
import { loadSettings, subscribeSettings } from '../shared/store.js';
import { APPLY_PACE, PROBE_PACE, RUN_ADVANCE } from '../shared/protocol.js';

export function wireContent({
  runtime = chrome.runtime,
  storage,
  doc = document,
  MutationObserver: MO = globalThis.MutationObserver,
  setInterval: tick = globalThis.setInterval,
  setTimeout: later = globalThis.setTimeout,
  makeChip = createChip,
  makeAdvance = () => defaultRunAdvance,
  log = console.info,
} = {}) {
  const chip = makeChip(doc);
  const runAdvance = makeAdvance(doc);
  const trip = createTripWatch({
    onTrip: () => log('[视频倍速助手] 站点持续改档，守速已熔断；下次调档自动恢复'),
  });
  const keeper = createKeeper({ trip, chip, hooks: {
    onPlay: (video) => {
      if (!skip.on) return;
      const target = introSeekTarget({ position: video.currentTime, introSkip: skip.introSkip });
      if (target != null) { try { video.currentTime = target; } catch { /* 受限元素忽略 */ } }
    },
    onTimeUpdate: (video) => {
      if (!skip.on) return;
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      if (video.ended || d - video.currentTime <= 0.3) return; // 已结束/已贴尾：不再重复收尾（防播放器被连续 seek 打死）
      const act = outroAction({ remaining: d - video.currentTime, loop: !!video.loop, outroSkip: skip.outroSkip });
      if (act === 'pause') { try { video.pause(); } catch { /* 同上 */ } }
      else if (act === 'toEnd') { try { video.currentTime = d; } catch { /* 同上 */ } }
    },
    onEnded: (video) => {
      if (!advance.auto) return;
      // 300ms 延迟：站点自身连播（视频重新起播）则不干预
      later(() => { if (video.paused) runAdvance(doc); }, 300);
    },
  } });
  const videos = () => doc.querySelectorAll('video');

  // 本帧快照：保持（M3）+ 跳过/续播（M4），经 storage 总线同步
  let hold = false;
  let heldPace = 1;
  const skip = { on: false, introSkip: 0, outroSkip: 0 };
  const advance = { auto: false };
  const holdText = (pace) => `🔒 ${formatPace(pace)}`;

  const takeSnapshot = (s) => {
    hold = !!s.hold;
    heldPace = clampPace(s.heldPace);
    skip.on = !!s.skipOn;
    skip.introSkip = clampSkip(s.introSkip);
    skip.outroSkip = clampSkip(s.outroSkip);
    advance.auto = !!s.autoAdvance;
  };
  // 跳过启用瞬间：对播放中且仍在片头区间的视频立即生效（行为规格）
  const introSweep = () => {
    if (!skip.on || !(skip.introSkip > 0)) return;
    for (const v of videos()) {
      if (v.paused) continue;
      const target = introSeekTarget({ position: v.currentTime, introSkip: skip.introSkip });
      if (target != null) { try { v.currentTime = target; } catch { /* 同上 */ } }
    }
  };

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
      return;
    }
    if (msg?.vpa === RUN_ADVANCE) {
      respond?.({ ok: runAdvance(doc) }); // 手动续播不受总开关限制
    }
  });

  if (storage) {
    loadSettings(storage).then((s) => {
      takeSnapshot(s);
      if (hold) keeper.applyAll(videos(), heldPace, { resetTrip: true, flashText: holdText(heldPace) });
      introSweep();
    });
    subscribeSettings((s) => {
      const skipWasOn = skip.on;
      takeSnapshot(s);
      if (hold) keeper.applyAll(videos(), heldPace, {}); // 静默回声套用
      if (!skipWasOn && skip.on) introSweep();            // 启用瞬间生效
    }, storage);
  }

  log('[视频倍速助手] 已注入帧:', globalThis.location?.href);
  return { keeper };
}

// 守卫式自启：node 测试环境无扩展 id 不启动；真实内容脚本有 id 才组装
if (globalThis.chrome?.runtime?.id) wireContent({ storage: globalThis.chrome?.storage?.local });
