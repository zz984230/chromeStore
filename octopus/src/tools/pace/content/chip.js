// src/content/chip.js — 档位浮标：施档时在帧右上角短暂浮现
export function createChip(doc) {
  let el = null;
  let hideTimer = null;
  return {
    flash(text) {
      const host = doc.body || doc.documentElement;
      if (!host) return; // 受限文档跳过
      if (!el) {
        el = doc.createElement('div');
        el.className = 'vpa-chip';
        host.appendChild(el);
      }
      el.textContent = text;
      el.classList.add('vpa-chip--on');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => el?.classList.remove('vpa-chip--on'), 1400);
    },
  };
}
