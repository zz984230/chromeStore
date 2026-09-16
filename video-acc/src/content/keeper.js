// src/content/keeper.js — 逐视频接管：施档、守速恢复、换源/播放重套
import { samePace, formatPace } from '../shared/paceMath.js';

export function createKeeper({ trip, chip } = {}) {
  const intent = new WeakMap(); // video → 期望档位
  const fromUs = new WeakSet(); // 我们自己的设速标记（防 ratechange 自激）
  const kept = new WeakSet();   // 已接线的视频
  let latest = null;            // 本帧最近一次应用的档位

  function impose(video, pace, { userDriven }) {
    intent.set(video, pace);
    latest = pace;
    try { video.defaultPlaybackRate = pace; } catch { /* 受限元素忽略 */ }
    if (!samePace(video.playbackRate ?? 1, pace)) {
      fromUs.add(video);
      try { video.playbackRate = pace; } catch { /* 同上 */ }
      // 微任务后清标记：覆盖同步与异步派发的自激 ratechange
      queueMicrotask(() => fromUs.delete(video));
    }
    if (userDriven) {
      trip?.reset(video);            // 用户驱动：解除熔断、清计数
      chip?.flash(formatPace(pace)); // 浮标提示
    }
  }

  function attach(video) {
    if (kept.has(video)) return;
    kept.add(video);
    video.addEventListener('ratechange', () => {
      const want = intent.get(video);
      if (want == null || fromUs.has(video)) return;
      if (!samePace(video.playbackRate ?? 1, want) && trip?.allows(video)) {
        impose(video, want, { userDriven: false }); // 站点覆盖 → 守速恢复（静默）
      }
    });
    video.addEventListener('loadedmetadata', () => {
      const want = intent.get(video);
      if (want != null) impose(video, want, { userDriven: false }); // 换源重套
    });
    video.addEventListener('play', () => {
      const want = intent.get(video);
      if (want != null && !samePace(video.playbackRate ?? 1, want)) {
        impose(video, want, { userDriven: false }); // 播放漂移纠回
      }
    });
  }

  return {
    attach,
    isKept: (video) => kept.has(video),
    intentOf: (video) => intent.get(video) ?? null,
    lastPace: () => latest,
    applyAll(videos, pace, { userDriven = true } = {}) {
      for (const v of videos) {
        attach(v); // 幂等：顺手接线新面孔
        impose(v, pace, { userDriven });
      }
    },
  };
}
