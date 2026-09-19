// src/popup/main.js
// M3+2 popup：紧凑快捷面板。public/popup.html 只留结构类名挂点，内部 DOM 由本文件
// 构建；设计稿 docs/superpowers/designs/2026-09-19-popup-mockup.html 的 ct 组行距、
// 标签着色、圆点内联样式不在移植样式表里，此处按稿件 markup 原样内联复刻。
// 结构：render 一次性搭骨架并接事件；sync 按设置快照重派全部控件——启动也走 sync，
// storage 回声走同一入口（popup 生命周期短，重派即防竞态）。
// 内部页（chrome:// 等，取不到 tab.url）→ 站点行「—」占位、胶囊禁用；storage 不可用
// （http 挂载）→ 默认值 + 占位域名静态预览、写入 no-op，对齐 options 先例。
import { STRINGS } from '../shared/strings.js';
import {
  DEFAULT_SETTINGS, defaultStorage, loadSettings, saveSettings, subscribeSettings,
} from '../shared/settings.js';
import { PALETTES } from '../shared/palettes.js';
import { hostnameFromUrl, removeHostFromList } from '../shared/actions.js';
import { hostnameInList } from '../shared/scope.js';
import { SEAT_CARDS, seatRadioValue } from '../shared/optionsM3.js';

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'checked' || k === 'disabled') { if (v) node[k] = true; }
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

let writable = false;
let current = { ...DEFAULT_SETTINGS };
let host = null; // 活动标签页 hostname（normalizeHostname 域）；falsy = 内部页/无 URL

function save(patch) {
  if (writable) saveSettings(patch).catch((e) => console.error(STRINGS.optionsSaveError, e));
}

function storageAvailable() {
  try { defaultStorage(); return true; } catch { return false; }
}

// ---- 大开关（#pp-dusk-host ↔ settings.state）----
function renderDusk() {
  const input = el('input', { type: 'checkbox', id: 'pp-state' });
  input.addEventListener('change', () => {
    const state = input.checked ? 'dark' : 'light';
    current = { ...current, state };
    save({ state });
    syncDusk(current); // 回声前的即时反馈
  });
  $('#pp-dusk-host').append(
    el('div', { class: 'copy' }, el('b', { id: 'pp-dusk-title' }), el('span')),
    el('label', { class: 'dusk-switch', 'aria-labelledby': 'pp-dusk-title' }, input,
      el('span', { class: 'sky' }, el('span', { class: 'stars' }, el('i'), el('i'), el('i')), el('span', { class: 'orb' }))));
}

function syncDusk(s) {
  const title = document.getElementById('pp-dusk-title');
  if (!title) return;
  const on = s.state === 'dark';
  const input = document.getElementById('pp-state');
  if (input) input.checked = on;
  title.textContent = on ? STRINGS.duskTitleOn : STRINGS.duskTitleOff;
  title.nextElementSibling.textContent = on ? STRINGS.popupGlobalSubOn : STRINGS.popupGlobalSubOff;
}

// ---- 站点行（#pp-site-row）：排除模式 on ⟺ host ∉ exclusionList；包含模式
// on ⟺ host ∈ inclusionList。点击切换 host 在当前模式列表中的归属（读态按
// hostnameInList 子域语义，写态删除按 D4 连带管辖父条目——actions.js
// removeHostFromList，M1b toolbarClickPatch 先例）。
function renderSiteRow() {
  const pill = el('button', { class: 'site-pill', type: 'button', id: 'pp-site-pill' });
  pill.addEventListener('click', () => {
    if (!host || !writable) return;
    const key = current.inclusionMode ? 'inclusionList' : 'exclusionList';
    const list = current[key] ?? [];
    const next = hostnameInList(host, list)
      ? removeHostFromList(list, host) // 连带管辖父条目，兄弟/子条目保留
      : [...list, host];
    current = { ...current, [key]: next };
    save({ [key]: next });
    syncSiteRow();
  });
  $('#pp-site-row').append(
    el('span', { class: 'site-ico', 'aria-hidden': 'true' }, '◐'),
    el('span', { class: 'site-name' }, el('b', { id: 'pp-site-host' }), el('span', { id: 'pp-site-sub' })),
    pill);
}

function syncSiteRow() {
  const b = document.getElementById('pp-site-host');
  const sub = document.getElementById('pp-site-sub');
  const pill = document.getElementById('pp-site-pill');
  if (!b || !sub || !pill) return;
  const ico = $('#pp-site-row .site-ico');
  if (!host) { // 内部页：不可按站点控制
    b.textContent = '—';
    sub.textContent = STRINGS.popupSiteInternal;
    pill.textContent = '—';
    pill.disabled = true;
    pill.classList.remove('on');
    if (ico) ico.textContent = '○';
    return;
  }
  const list = current[current.inclusionMode ? 'inclusionList' : 'exclusionList'] ?? [];
  const inList = hostnameInList(host, list);
  const on = current.inclusionMode ? inList : !inList;
  b.textContent = host;
  pill.disabled = false;
  pill.classList.toggle('on', on);
  pill.textContent = on ? STRINGS.popupSitePillOn
    : (current.inclusionMode ? STRINGS.popupSitePillInclude : STRINGS.popupSitePillExclude);
  sub.textContent = current.inclusionMode
    ? (on ? STRINGS.popupSiteActiveInclude : STRINGS.popupSiteNotIncluded)
    : (on ? STRINGS.popupSiteActiveExclude : STRINGS.popupSiteExcluded);
  if (ico) ico.textContent = on ? '◐' : '○';
}

// ---- 三席（#pp-seats）：radio value 域 = adaptive / 首调色板 id / custom；
// popup 只切席位——色板与编辑器面板全在选项页。
function renderSeats() {
  const seats = el('div', { class: 'seats-mini' });
  for (const card of SEAT_CARDS) {
    const value = card.themeId === 'classic' ? PALETTES[0].id : card.themeId;
    seats.append(el('label', { class: 'seat-mini' },
      el('input', { type: 'radio', name: 'themeId', value }),
      el('span', { class: 't' }, card.title)));
  }
  seats.addEventListener('change', (e) => {
    if (e.target.name !== 'themeId') return;
    current = { ...current, themeId: e.target.value };
    save({ themeId: e.target.value });
    syncSeats(current);
  });
  $('#pp-seats').append(el('div', { class: 'grp-label' }, STRINGS.popupThemeLabel), seats);
}

function syncSeats(s) {
  for (const i of document.querySelectorAll('#pp-seats input[name="themeId"]')) {
    i.checked = i.value === seatRadioValue(s.themeId);
  }
}

// ---- 色温（#pp-ct）：开关 ↔ enabled；浓度滑杆 input 实时落盘。
function fillSlider(input) {
  const p = (input.value - input.min) / (input.max - input.min) * 100;
  input.style.setProperty('--fill', `${p}%`);
}

function syncCtDot(ct) {
  const dot = document.getElementById('pp-ct-dot');
  if (!dot) return;
  dot.style.background = `rgb(${ct.red} ${ct.green} ${ct.blue} / ${(ct.opacity ?? 0) / 100})`;
  dot.style.opacity = ct.enabled ? 1 : 0.35;
}

function renderCt() {
  const on = el('input', { type: 'checkbox', id: 'pp-ct-on' });
  const slider = el('input', { type: 'range', id: 'pp-ct-opacity', min: '0', max: '100', step: '1' });
  const out = el('output', { for: 'pp-ct-opacity' });
  on.addEventListener('change', () => {
    const next = { ...(current.colorTemperature ?? {}), enabled: on.checked };
    current = { ...current, colorTemperature: next };
    save({ colorTemperature: next });
    syncCt(next);
  });
  slider.addEventListener('input', () => {
    const next = { ...(current.colorTemperature ?? {}), opacity: Number(slider.value) };
    current = { ...current, colorTemperature: next };
    fillSlider(slider);
    out.textContent = slider.value;
    syncCtDot(next);
    save({ colorTemperature: next }); // input 实时存（§6.4 惯例）
  });
  // 稿件 markup 内联样式：行距 10px；标签着色 ink-2 / ink-3(flex:none)；圆点 margin-left:auto。
  $('#pp-ct').append(
    el('div', { class: 'row', style: 'margin-bottom:10px' },
      el('label', { class: 'inline-switch' }, on, el('span', { class: 'track' }), el('span', { class: 'knob' })),
      el('span', { style: 'color:var(--ink-2)' }, STRINGS.popupColorTempLabel),
      el('span', { class: 'ct-dot', id: 'pp-ct-dot', style: 'margin-left:auto' })),
    el('div', { class: 'row', id: 'pp-ct-body' },
      el('span', { style: 'color:var(--ink-3);flex:none' }, STRINGS.popupDensityLabel),
      slider, out));
}

function syncCt(ct) {
  const on = document.getElementById('pp-ct-on');
  if (!on) return;
  on.checked = Boolean(ct.enabled);
  document.getElementById('pp-ct-body')?.classList.toggle('dimmed', !ct.enabled);
  syncCtDot(ct);
  const slider = document.getElementById('pp-ct-opacity');
  if (slider && document.activeElement !== slider) { // 拖动中不被回声覆盖
    slider.value = ct.opacity;
    fillSlider(slider);
    const out = document.querySelector('output[for="pp-ct-opacity"]');
    if (out) out.textContent = String(ct.opacity);
  }
}

// ---- 底部（#pp-foot）：品牌行静态，「全部设置」跳选项页 ----
function renderFoot() {
  const btn = el('button', { class: 'link', type: 'button' }, STRINGS.popupAllSettings);
  btn.addEventListener('click', () => {
    if (writable) chrome.runtime.openOptionsPage();
  });
  $('#pp-foot').append(el('span', {}, STRINGS.popupBrandLine), btn);
}

function sync(s) {
  current = s;
  syncDusk(s);
  syncSiteRow();
  syncSeats(s);
  syncCt(s.colorTemperature ?? {});
}

function renderAll() {
  renderDusk();
  renderSiteRow();
  renderSeats();
  renderCt();
  renderFoot();
}

function render() {
  renderAll();
  if (storageAvailable()) {
    writable = true;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs?.[0]?.url;
      // 无「tabs」权限下 tab.url 只在 host_permissions 覆盖时可见；但 url 一旦可见，
      // chrome://newtab/ 这类也会被 URL 解析出伪主机名（'newtab'）——站点作用域只对
      // http(s) 有意义，非 http(s) 一律按内部页处理（占位「—」、胶囊禁用）。
      host = /^https?:/i.test(url ?? '') ? hostnameFromUrl(url) : null;
      loadSettings().then((s) => { sync(s); subscribeSettings(sync); });
    });
  } else {
    // 预览退化（http 挂载）：默认值 + 占位域名，写入全部 no-op。
    host = 'example.com';
    document.body.setAttribute('data-preview', '');
    sync(current);
  }
}

render();
