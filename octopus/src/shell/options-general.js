// src/shell/options-general.js — 通用翼:字号/快捷键/数据/关于(壳级,跨工具)
import { SHELL_STRINGS as SS } from './strings.js';
import { loadSettings as loadVeil, saveSettings as saveVeil } from '../tools/veil/shared/settings.js';
import { clampPace } from '../tools/pace/shared/paceMath.js';
import { IDS, WINGS } from './store.js';

export const EXPORT_KEYS = ['nightveil.settings', 'vpa.settings', 'oct.shell'];

// 逐键验形:结构层(键值非对象)整体拒;语义层(字段脏)丢键不丢包。
// 返回 null=不是本扩展的设置文件;{}=合法包但无已知键内容(空导出)。
// 依据:pace loadSettings 读侧不夹取({...DEFAULTS, ...stored} 直透),
// 导入侧是脏数值(字符串数/null/负片秒)进入运行时的最后一道闸。
const PACE_RANGE = { introSkip: [0, 3600], outroSkip: [0, 3600] };

function sanitizePace(v) {
  for (const f of ['pace', 'heldPace']) {
    if (v[f] !== undefined && !Number.isFinite(v[f])) return null;
  }
  for (const [f, [lo, hi]] of Object.entries(PACE_RANGE)) {
    if (v[f] !== undefined && !(Number.isFinite(v[f]) && v[f] >= lo && v[f] <= hi)) return null;
  }
  for (const f of ['hold', 'skipOn', 'autoAdvance']) {
    if (v[f] !== undefined && typeof v[f] !== 'boolean') return null;
  }
  const out = { ...v };
  if (out.pace !== undefined) out.pace = clampPace(out.pace);
  if (out.heldPace !== undefined) out.heldPace = clampPace(out.heldPace);
  return out;
}

function sanitizeShell(v) {
  if (v.activeTool !== undefined && !IDS.has(v.activeTool)) return null;
  if (v.activeWing !== undefined && !WINGS.has(v.activeWing)) return null;
  return { ...v };
}

export function parseImportFile(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!parsed || parsed.app !== 'octopus' || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) return null;
  const out = {};
  for (const k of EXPORT_KEYS) {
    const v = parsed.data[k];
    if (v === undefined) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    let clean = v;
    if (k === 'vpa.settings') { clean = sanitizePace(v); if (!clean) continue; }
    else if (k === 'oct.shell') { clean = sanitizeShell(v); if (!clean) continue; }
    out[k] = clean;
  }
  return out;
}

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.flat());
  return n;
};
// note 尾参可续挂子节点(数据区的「新增」tag 按认可稿落在 note span 内)。
const section = (parent, title, note, ...noteTail) => {
  const sec = el('section', { class: 'opt-sec' });
  sec.append(el('div', { class: 'sec-head' }, el('h4', {}, title), note ? el('span', { class: 'note' }, note, ...noteTail) : []));
  parent.append(sec);
  return sec;
};

// 预览降级对等(veil 翼同款,参照其 storageAvailable 模式):无 chrome.storage 的
// http 挂载下仍渲染——字号用默认 13,快捷键表与关于以 getManifest try/catch 兜底,
// 数据三钮禁用;main 设 data-preview 降透明度。
function storageAvailable() {
  return Boolean(globalThis.chrome?.storage?.local);
}

export function initGeneralOptions(host = document.getElementById('opt-gen')) {
  if (!host) return;
  render(host);
}

async function render(host) {
  const preview = !storageAvailable();
  if (preview) document.querySelector('main')?.setAttribute('data-preview', '');
  host.replaceChildren();
  host.append(el('div', { class: 'page-head' }, el('div', {}, el('h2', {}, SS.generalHeading), el('p', {}, SS.generalIntro))));

  // 界面:字号(原 veil §6.1 迁入,仍写 nightveil.settings.ui.fontSize)
  const uiSec = section(host, SS.fontSizeLabel, SS.fontSizeNote);
  const veil = preview ? { ui: { fontSize: 13 } } : await loadVeil();
  const out = el('output', {}, `${veil.ui?.fontSize ?? 13}px`);
  const slider = el('input', { type: 'range', min: '10', max: '22', step: '1', value: String(veil.ui?.fontSize ?? 13), 'aria-label': SS.fontSizeLabel });
  slider.addEventListener('input', () => { out.textContent = `${slider.value}px`; });
  slider.addEventListener('change', async () => {
    const v = Math.min(22, Math.max(10, Math.round(Number(slider.value))));
    if (!preview) await saveVeil({ ui: { fontSize: v } }); // 预览态不可写,滑杆仅即时反馈
    document.documentElement.style.setProperty('--font-size', `${v}px`);
  });
  document.documentElement.style.setProperty('--font-size', `${veil.ui?.fontSize ?? 13}px`);
  uiSec.append(el('div', { class: 'row' }, el('span', { class: 'row-label' }, SS.fontSizeLabel), slider, out));

  // 快捷键:manifest 真话(预览挂载无 manifest,try/catch 兜底为空表)
  const kbdSec = section(host, SS.shortcutTitle, SS.shortcutNote);
  const table = el('table', { class: 'kbd-table' });
  let commands = {};
  try { commands = chrome.runtime.getManifest().commands ?? {}; } catch {}
  for (const cmd of Object.values(commands)) {
    const combo = cmd.suggested_key?.default;
    table.append(el('tr', {}, el('td', {}, cmd.description ?? ''),
      el('td', {}, combo ? combo.split('+').map((k) => el('kbd', {}, k)) : el('span', { style: 'color:var(--ink-3)' }, SS.shortcutUnbound))));
  }
  kbdSec.append(table, el('p', { class: 'hint' }, SS.shortcutPageHint));

  // 数据:导出/导入/全部恢复默认(预览态三钮禁用——无存储可写)
  const dataSec = section(host, SS.dataTitle, `${SS.dataNote} `, el('span', { class: 'tag-new' }, SS.dataTagNew));
  const btnAttrs = preview ? { disabled: '' } : {};
  dataSec.append(el('div', { class: 'actions' },
    el('button', { class: 'btn', type: 'button', onclick: exportData, ...btnAttrs }, SS.dataExport),
    el('button', { class: 'btn', type: 'button', onclick: importData, ...btnAttrs }, SS.dataImport),
    el('button', { class: 'btn ghost', type: 'button', onclick: resetAll, ...btnAttrs }, SS.dataResetAll)),
    el('p', { class: 'hint' }, SS.dataHint),
    el('p', { class: 'hint' }, SS.dataPrivacyNote));

  // 关于(预览挂载无 manifest,try/catch 兜底为空文案)
  let m = null;
  try { m = chrome.runtime.getManifest(); } catch {}
  section(host, SS.aboutTitle).append(el('p', { class: 'hint', style: 'margin:0' }, m ? `${m.name} ${m.version} · ${m.description}` : ''));
}

function exportData() {
  chrome.storage.local.get(EXPORT_KEYS, (records) => {
    if (chrome.runtime.lastError) { alert(SS.storageReadFail); return; }
    const blob = new Blob([JSON.stringify({ app: 'octopus', exportedAt: new Date().toISOString(), data: records ?? {} }, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `octopus-settings-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  });
}

function importData() {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', () => {
    const file = input.files?.[0]; if (!file) return;
    file.text()
      .then((text) => {
        const parsed = parseImportFile(text);
        if (parsed === null) { alert(SS.importBadFile); return; }
        if (!Object.keys(parsed).length) { alert(SS.importEmpty); return; }
        chrome.storage.local.set(parsed, () => {
          if (chrome.runtime.lastError) { alert(SS.storageWriteFail); return; }
          location.reload();
        });
      })
      .catch(() => alert(SS.importReadFail));
  });
  input.click();
}

function resetAll() {
  if (!confirm(SS.resetConfirm)) return;
  chrome.storage.local.remove(EXPORT_KEYS, () => {
    if (chrome.runtime.lastError) { alert(SS.storageWriteFail); return; }
    location.reload();
  });
}
