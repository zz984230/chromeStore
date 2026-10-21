// src/tools/diff/page/main.js — 工作页控制器:DOM 接线薄层,逻辑全在 shared/(ADR-0005)
import { runCompare } from '../shared/compare.js';
import { toChunks } from '../shared/chunker.js';
import { applyChunk } from '../shared/merge.js';
import { PROCESSORS } from '../shared/processors.js';
import { DIFF_STRINGS } from '../shared/strings.js';
import { nextHistory, undoFrom, redoFrom, saveSession, loadSession } from './state.js';

const $ = (id) => document.getElementById(id);
const leftBox = $('diff-left');
const rightBox = $('diff-right');
const compareBtn = $('diff-compare');
const wrapToggle = $('diff-wrap');
const swapBtn = $('diff-swap');
const clearBtn = $('diff-clear');
const undoBtn = $('diff-undo');
const redoBtn = $('diff-redo');
const note = $('diff-note');
const banner = $('diff-banner');
const resultSec = $('diff-result');
const outLeft = $('diff-out-left');
const outRight = $('diff-out-right');
const session = globalThis.sessionStorage;

let hist = { undo: [], redo: [] };
let compared = false; // 只有显式对比(或其后继操作)才驱动结果区
let lastChunks = null;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texts = () => ({ left: leftBox.value, right: rightBox.value });

let saveTimer = 0;
function saveSoon() { // 输入防抖兜底:F5 不丢正在合并的工作(裁定 7)
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSession(session, leftBox.value, rightBox.value), 300);
}

function renderBar() {
  undoBtn.disabled = hist.undo.length === 0;
  redoBtn.disabled = hist.redo.length === 0;
}

function rowHtml(op, side) {
  const ln = side === 'left' ? (op.aLn ?? '') : (op.bLn ?? '');
  const cls = op.t === '-' ? ' is-del' : op.t === '+' ? ' is-add' : '';
  const sign = op.t === '=' ? ' ' : op.t;
  return `<div class="df-row${cls}"><span class="df-ln">${ln}</span><span class="df-sign">${sign}</span><span class="df-text">${esc(op.text)}</span></div>`;
}

function renderResult(res) {
  banner.hidden = !res.degraded;
  const chunks = toChunks(res.ops);
  lastChunks = chunks;
  let nDiff = 0;
  const leftHtml = [];
  const rightHtml = [];
  chunks.forEach((c, i) => {
    if (c.kind === '=') {
      for (const op of c.lines) { leftHtml.push(rowHtml(op, 'left')); rightHtml.push(rowHtml(op, 'right')); }
      return;
    }
    nDiff++;
    leftHtml.push(`<div class="df-adopt"><button type="button" class="df-btn" data-chunk="${i}" data-winner="left">${DIFF_STRINGS.adoptLeft}</button></div>`);
    for (const op of c.del) leftHtml.push(rowHtml(op, 'left'));
    rightHtml.push(`<div class="df-adopt"><button type="button" class="df-btn" data-chunk="${i}" data-winner="right">${DIFF_STRINGS.adoptRight}</button></div>`);
    for (const op of c.add) rightHtml.push(rowHtml(op, 'right'));
  });
  outLeft.innerHTML = leftHtml.join('');
  outRight.innerHTML = rightHtml.join('');
  note.textContent = nDiff === 0 ? DIFF_STRINGS.identical : DIFF_STRINGS.diffCount.replace('{n}', String(nDiff));
  resultSec.hidden = false;
}

function compare() {
  const res = runCompare(leftBox.value, rightBox.value);
  if (!res.ok) {
    compared = false;
    lastChunks = null;
    resultSec.hidden = true;
    banner.hidden = true;
    note.textContent = res.error === 'bytes' ? DIFF_STRINGS.tooManyBytes : DIFF_STRINGS.tooManyLines;
    return;
  }
  compared = true;
  renderResult(res);
}

function setBoxes(next) {
  leftBox.value = next.left;
  rightBox.value = next.right;
  saveSession(session, next.left, next.right);
}

function recompareIfActive() { if (compared) compare(); }

compareBtn.addEventListener('click', compare);
for (const ta of [leftBox, rightBox]) ta.addEventListener('input', saveSoon);
wrapToggle.addEventListener('change', () => document.body.classList.toggle('df-wrap-on', wrapToggle.checked));
swapBtn.addEventListener('click', () => {
  const t = texts();
  setBoxes({ left: t.right, right: t.left });
  recompareIfActive();
});
clearBtn.addEventListener('click', () => {
  if (leftBox.value === '' && rightBox.value === '') return;
  setBoxes({ left: '', right: '' });
  compared = false;
  lastChunks = null;
  resultSec.hidden = true;
  banner.hidden = true;
  note.textContent = DIFF_STRINGS.hint;
});
undoBtn.addEventListener('click', () => {
  const u = undoFrom(texts(), hist);
  if (!u) return;
  hist = u.hist;
  setBoxes(u.texts);
  renderBar();
  recompareIfActive();
});
redoBtn.addEventListener('click', () => {
  const r = redoFrom(texts(), hist);
  if (!r) return;
  hist = r.hist;
  setBoxes(r.texts);
  renderBar();
  recompareIfActive();
});

function wireOpen(btn, input, box) {
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    file.text()
      .then((t) => { box.value = t; saveSoon(); recompareIfActive(); })
      .catch(() => { note.textContent = DIFF_STRINGS.readFileFail; });
    input.value = '';
  });
}
wireOpen($('diff-open-left'), $('diff-file-left'), leftBox);
wireOpen($('diff-open-right'), $('diff-file-right'), rightBox);

for (const rail of document.querySelectorAll('.df-procs')) {
  rail.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-op]');
    if (!btn) return;
    const fn = PROCESSORS[btn.dataset.op];
    if (!fn) return;
    const box = rail.dataset.side === 'left' ? leftBox : rightBox;
    box.value = fn(box.value);
    saveSoon();
    recompareIfActive();
  });
}

resultSec.addEventListener('click', (e) => { // 合并:快照入栈 → 写回两栏 → 重算(输入框是唯一事实源)
  const btn = e.target.closest('button[data-chunk]');
  if (!btn || !lastChunks) return;
  const merged = applyChunk(lastChunks, Number(btn.dataset.chunk), btn.dataset.winner);
  if (!merged) return;
  hist = nextHistory(hist, texts());
  setBoxes(merged);
  renderBar();
  compare();
});

(function boot() {
  const saved = loadSession(session);
  if (saved.left || saved.right) { leftBox.value = saved.left; rightBox.value = saved.right; }
  document.body.classList.toggle('df-wrap-on', wrapToggle.checked);
  renderBar();
})();
