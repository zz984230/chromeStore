// src/shell/popup.js — 壳:tab 条 + 当前工具记忆(Q4);面板 DOM 由各工具 popup main 自挂
import { loadShell, saveShellPatch } from './store.js';
import '../tools/veil/popup/main.js';
import '../tools/pace/popup/main.js';

const buttons = [...document.querySelectorAll('#oct-tabs button')];
const panels = { veil: document.getElementById('oct-panel-veil'), pace: document.getElementById('oct-panel-pace') };

function show(id) {
  for (const b of buttons) b.classList.toggle('is-active', b.dataset.tool === id);
  for (const [tid, panel] of Object.entries(panels)) panel.classList.toggle('is-hidden', tid !== id);
}

for (const b of buttons) {
  b.addEventListener('click', () => {
    show(b.dataset.tool);
    saveShellPatch({ activeTool: b.dataset.tool }).catch(() => {}); // 预览模式写入失败即静默
  });
}

loadShell().then((s) => show(s.activeTool)).catch(() => show('veil'));
