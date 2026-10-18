// src/shell/options.js — M1:壳接管 options 骨架(三翼侧边栏);夜幕面板仍由 veil options main 挂
import { loadShell, saveShellPatch } from './store.js';
import '../tools/veil/options/main.js';
// M1 Task2/3 落地时在此追加:
// import { initPaceOptions } from '../tools/pace/options/main.js';
// import { initGeneralOptions } from './options-general.js';

const buttons = [...document.querySelectorAll('#opt-nav button')];
const views = [...document.querySelectorAll('.view')];

function show(wing) {
  for (const b of buttons) b.classList.toggle('is-active', b.dataset.wing === wing);
  for (const v of views) v.classList.toggle('is-on', v.dataset.wing === wing);
}

for (const b of buttons) {
  b.addEventListener('click', () => {
    show(b.dataset.wing);
    saveShellPatch({ activeWing: b.dataset.wing }).catch(() => {}); // 预览模式写入失败即静默
  });
}

loadShell().then((s) => show(s.activeWing)).catch(() => show('veil'));
