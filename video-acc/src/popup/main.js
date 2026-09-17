// src/popup/main.js — 弹窗：滑块与预设调档；状态行显示活动页实际/存储档位
import { PRESETS, clampPace, formatPace, samePace } from '../shared/paceMath.js';
import { loadSettings, saveSettings } from '../shared/store.js';
import { nudgeActiveTab } from '../shared/notify.js';
import { PROBE_PACE } from '../shared/protocol.js';

const figure = document.getElementById('pace-figure');
const dial = document.getElementById('pace-dial');
const chipsBox = document.getElementById('pace-chips');
const note = document.getElementById('pace-note');
const verEl = document.getElementById('app-version');
if (verEl) verEl.textContent = chrome.runtime.getManifest().version;

const chipButtons = PRESETS.map((p) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.pace = String(p);
  b.textContent = formatPace(p);
  chipsBox.appendChild(b);
  return b;
});

function paint(pace) {
  figure.textContent = formatPace(pace);
  dial.value = String(pace);
  for (const b of chipButtons) {
    b.classList.toggle('chip--active', samePace(Number(b.dataset.pace), pace));
  }
}

function noteFor(live, pace) {
  return live ? `当前页面 ${formatPace(pace)}` : `已存 ${formatPace(pace)} · 本页未接管`;
}

async function commit(pace) {
  pace = clampPace(pace);
  paint(pace);
  await saveSettings({ pace });
  const reply = await nudgeActiveTab(pace);
  note.textContent = noteFor(reply && typeof reply.pace === 'number', pace);
}

dial.addEventListener('input', () => {
  figure.textContent = formatPace(Number(dial.value)); // 拖动即时显示，松手才提交
});
dial.addEventListener('change', () => commit(Number(dial.value)));
chipsBox.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-pace]');
  if (b) commit(Number(b.dataset.pace));
});

(async () => {
  const { pace } = await loadSettings();
  paint(pace);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const live = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { vpa: PROBE_PACE }, (resp) => {
        void chrome.runtime.lastError; // 未注入页消费错误
        resolve(resp);
      });
    });
    if (live && typeof live.pace === 'number') paint(live.pace);
    note.textContent = noteFor(Boolean(live && typeof live.pace === 'number'), live?.pace ?? pace);
  } catch {
    note.textContent = noteFor(false, pace);
  }
})();
