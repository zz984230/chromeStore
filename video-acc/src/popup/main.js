// src/popup/main.js — 弹窗：滑块与预设调档；状态行显示活动页实际/存储档位
import { PRESETS, clampPace, formatPace, samePace } from '../shared/paceMath.js';
import { loadSettings, saveSettings } from '../shared/store.js';
import { nudgeActiveTab, pushAdvanceNow } from '../shared/notify.js';
import { clampSkip } from '../shared/skipPlan.js';
import { PROBE_PACE } from '../shared/protocol.js';

const figure = document.getElementById('pace-figure');
const dial = document.getElementById('pace-dial');
const chipsBox = document.getElementById('pace-chips');
const note = document.getElementById('pace-note');
const verEl = document.getElementById('app-version');
if (verEl) verEl.textContent = chrome.runtime.getManifest().version;
const holdSwitch = document.getElementById('hold-switch');
const holdLabel = document.getElementById('hold-label');
let hold = false; // 本弹窗会话的保持快照
const skipIntro = document.getElementById('skip-intro');
const skipOutro = document.getElementById('skip-outro');
const skipSwitch = document.getElementById('skip-switch');
const skipLabel = document.getElementById('skip-label');
const advanceSwitch = document.getElementById('advance-switch');
const advanceLabel = document.getElementById('advance-label');
const advanceNow = document.getElementById('advance-now');
let skipOn = false;      // 本弹窗会话快照
let autoAdvance = false; // 同上
const warnWrite = (e) => console.warn('[视频倍速助手] popup 写入失败:', e?.message || e);

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

function renderHold(heldPace) {
  holdSwitch.setAttribute('aria-pressed', String(hold));
  holdLabel.textContent = hold ? `保持：${formatPace(heldPace)} — 新视频自动套用` : '保持：关';
}

function renderSkip() {
  skipSwitch.setAttribute('aria-pressed', String(skipOn));
  skipLabel.textContent = skipOn ? '跳过：开' : '跳过：关';
}
function renderAdvance() {
  advanceSwitch.setAttribute('aria-pressed', String(autoAdvance));
  advanceLabel.textContent = autoAdvance ? '续播：开' : '续播：关';
}

async function commit(pace) {
  pace = clampPace(pace);
  paint(pace);
  try {
    const patch = { pace };
    if (hold) patch.heldPace = pace; // 保持期间调档同步更新记忆
    await saveSettings(patch);
    if (hold) renderHold(pace); // 保持期间调档同步记忆 → 标签同步
    const reply = await nudgeActiveTab(pace);
    note.textContent = noteFor(reply && typeof reply.pace === 'number', pace);
  } catch (e) {
    warnWrite(e);
  }
}

dial.addEventListener('input', () => {
  figure.textContent = formatPace(Number(dial.value)); // 拖动即时显示，松手才提交
});
dial.addEventListener('change', () => commit(Number(dial.value)));
chipsBox.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-pace]');
  if (b) commit(Number(b.dataset.pace));
});

async function commitSkip() {
  await saveSettings({
    introSkip: clampSkip(skipIntro.value),
    outroSkip: clampSkip(skipOutro.value),
  });
}
skipIntro.addEventListener('change', commitSkip);
skipOutro.addEventListener('change', commitSkip);

skipSwitch.addEventListener('click', async () => {
  skipOn = !skipOn;
  renderSkip();
  await saveSettings({ skipOn });
});

advanceSwitch.addEventListener('click', async () => {
  autoAdvance = !autoAdvance;
  renderAdvance();
  await saveSettings({ autoAdvance });
});

advanceNow.addEventListener('click', async () => {
  advanceNow.textContent = '⏳ 查找中…';
  const ok = await pushAdvanceNow();
  advanceNow.textContent = ok ? '✓ 已触发' : '⚠ 未找到下一节入口';
  setTimeout(() => { advanceNow.textContent = '▶ 立即续播'; }, 1500);
});

async function toggleHold() {
  hold = !hold;
  const patch = hold ? { hold: true, heldPace: clampPace(Number(dial.value)) } : { hold: false };
  renderHold(patch.heldPace ?? 1);
  await saveSettings(patch);
}
holdSwitch.addEventListener('click', () => toggleHold().catch(warnWrite));

(async () => {
  const settings = await loadSettings();
  const pace = settings.pace;
  paint(pace);
  hold = !!settings.hold;
  renderHold(settings.heldPace);
  skipOn = !!settings.skipOn;
  autoAdvance = !!settings.autoAdvance;
  skipIntro.value = String(settings.introSkip);
  skipOutro.value = String(settings.outroSkip);
  renderSkip();
  renderAdvance();
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
