// src/content/advance.js — 自动续播：候选打分（纯）+ 收集与触发（胶水）
// 与参考插件的分桶法不同：单趟打分、负词一票否决、按可见性收尾。

// 强词：明确的下一节/集/课/章/话/回/P/篇 或 next episode 系
const STRONG = /下一(节|集|课|章|话|回|P|p|篇)|next\s*(ep|episode|lesson|chapter|part)/i;
// 弱词：泛指的下一个/next
const WEAK = /下一个|下集|next\b/i;
// 负词：上一系、翻页、标签页、评论/相关/推荐、播放列表——一票否决防误点
const NEGATIVE = /上一|prev|previous|下一页|next\s*page|下一个标签|评论|comment|相关|related|推荐|recommend|playlist|播放列表|\btab\b/i;

export function advanceScore({ label = '', text = '', cls = '', disabled = false }) {
  if (disabled) return -Infinity;
  const hay = `${label} ${text} ${cls}`;
  if (NEGATIVE.test(hay)) return -Infinity;
  let score = 0;
  if (STRONG.test(label)) score += 6;      // title/aria 比正文可信
  else if (WEAK.test(label)) score += 2;
  if (STRONG.test(text)) score += 3;
  else if (WEAK.test(text)) score += 1;
  if (/next/i.test(cls)) score += 0.5;
  return score;
}

export function pickAdvanceIndex(descriptors) {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < descriptors.length; i++) {
    const s = advanceScore(descriptors[i]);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

// 触发一次完整指针序列（兼容原生 click 与 React/Vue 合成事件）
export function pokeTarget(el) {
  try {
    const opts = { bubbles: true, cancelable: true, view: globalThis };
    const fire = (type) => {
      try { el.dispatchEvent(new PointerEvent(type, opts)); }
      catch { el.dispatchEvent(new MouseEvent(type, opts)); }
    };
    fire('pointerdown');
    fire('mousedown');
    fire('pointerup');
    fire('mouseup');
    el.click?.();
    return true;
  } catch { return false; }
}

// —— 以下为 DOM 胶水（不单测，Task 8 /tabbit 实测覆盖）——

export function collectAdvanceCandidates(doc) {
  const nodes = doc.querySelectorAll(
    'button, a, [role="button"], [onclick], [class*="next" i], [class*="cursor-pointer" i]'
  );
  const out = [];
  for (const el of nodes) {
    out.push({
      el,
      label: (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim().slice(0, 60),
      text: (el.textContent || '').trim().slice(0, 80),
      cls: typeof el.className === 'string' ? el.className : '',
      disabled: !!el.disabled,
    });
  }
  return out;
}

export function runAdvance(doc) {
  const visible = collectAdvanceCandidates(doc).filter((c) => {
    const rect = c.el.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0;
  });
  const idx = pickAdvanceIndex(visible);
  if (idx < 0) return false;
  return pokeTarget(visible[idx].el);
}
