// src/content/keeper.js — 逐视频接管：施档、守速恢复、换源/播放重套
import { samePace } from '../shared/paceMath.js';

export function createKeeper({ trip, chip, hooks = {} } = {}) {
  const intent = new WeakMap(); // video → 期望档位
  const fromUs = new WeakSet(); // 我们自己的设速标记（防 ratechange 自激）
  const kept = new WeakSet();   // 已接线的视频
  let latest = null;            // 本帧最近一次应用的档位

  function impose(video, pace, { resetTrip = false, flashText = null } = {}) {
    intent.set(video, pace);
    latest = pace;
    try { video.defaultPlaybackRate = pace; } catch { /* 受限元素忽略 */ }
    if (!samePace(video.playbackRate ?? 1, pace)) {
      fromUs.add(video);
      try { video.playbackRate = pace; } catch { /* 同上 */ }
      // 微任务后清标记：覆盖同步派发的自激 ratechange（异步自激事件由速率相等短路兜底）
      queueMicrotask(() => fromUs.delete(video));
    }
    if (resetTrip) trip?.reset(video);            // 显式复位熔断（用户/保持施档）
    if (flashText != null) chip?.flash(flashText); // 显式浮标（文本含 🔒 前缀时表示保持）
  }

  function attach(video) {
    if (kept.has(video)) return;
    kept.add(video);
    video.addEventListener('ratechange', () => {
      const want = intent.get(video);
      if (want == null || fromUs.has(video)) return;
      if (!samePace(video.playbackRate ?? 1, want) && trip?.allows(video)) {
        impose(video, want); // 站点覆盖 → 守速恢复（静默）
      }
    });
    video.addEventListener('loadedmetadata', () => {
      const want = intent.get(video);
      if (want != null) impose(video, want); // 换源重套（静默）
    });
    video.addEventListener('play', () => {
      const want = intent.get(video);
      if (want != null && !samePace(video.playbackRate ?? 1, want)) {
        impose(video, want); // 播放漂移纠回（静默）
      }
    });
    if (hooks.onPlay) video.addEventListener('play', () => hooks.onPlay(video));
    if (hooks.onTimeUpdate) video.addEventListener('timeupdate', () => hooks.onTimeUpdate(video));
    if (hooks.onEnded) video.addEventListener('ended', () => hooks.onEnded(video));
  }

  return {
    attach,
    isKept: (video) => kept.has(video),
    intentOf: (video) => intent.get(video) ?? null,
    lastPace: () => latest,
    applyAll(videos, pace, opts = {}) {
      for (const v of videos) {
        attach(v); // 幂等：顺手接线新面孔
        impose(v, pace, opts);
      }
    },
  };
}
