// src/options/main.js
// M3+ options page: first screen (dusk switch / theme seats / color
// temperature / schedule / sites) plus the advanced fold (#sec-advanced)
// hosting the remaining M3 controls in four adv-groups — engine / guard /
// rules / misc. All copy comes from shared/strings.js; control data from
// palettes/siteThemes. Edits autosave via saveSettings; storage.onChanged
// keeps open pages in sync. When chrome.storage is unavailable (http fixture
// mount) the page renders a disabled preview from defaults so rendering stays
// verifiable.
import { STRINGS } from '../shared/strings.js';
import {
  DEFAULT_SETTINGS, defaultStorage, loadSettings, saveSettings, subscribeSettings,
} from '../shared/settings.js';
import { PALETTES } from '../shared/palettes.js';
import { SITE_THEMES } from '../shared/siteThemes.js';
import {
  seatCheckboxState, ENGINE_GROUPS, ENGINE_SITE_POLICIES,
  ENGINE_CONTROLS, ENGINE_BEHAVIOR_HOST, ENGINE_VARIABLE_CONTROLS,
  ENGINE_EXTRA_RULES_CONTROL, colorInputValue, assembleEnginePatch,
  controlValue, tuningFallback, engineValueAt,
} from '../shared/optionsEngine.js';
import { ENGINE_VARIABLES, EXTRA_RULES_DEFAULT } from '../shared/engineTheme.js';
import { FLASHGUARD_MODES, parseHostList, clampNumber, SEAT_CARDS } from '../shared/optionsM3.js';
import { wireEditor } from './editor.js';

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

// adv-group 宿主的组标题：.adv-group h4（设计系统 CSS 既定）；这些宿主是普通
// div，不是 details——折叠开合只属于外层 #sec-advanced。
function section(id, headingText, ...body) {
  $(`#${id}`).append(el('h4', {}, headingText), ...body);
}

function note(text) { return el('p', { class: 'hint' }, text); }

function secHead(title, noteText) {
  return el('div', { class: 'sec-head' }, el('h3', {}, title), el('span', { class: 'note' }, noteText));
}

function storageAvailable() {
  try { defaultStorage(); return true; } catch { return false; }
}

let writable = false;
let current = { ...DEFAULT_SETTINGS };

function save(patch) {
  if (writable) saveSettings(patch).catch((e) => console.error(STRINGS.optionsSaveError, e));
}

// ---- 首屏：天际线大开关 ----
function renderDusk() {
  const host = $('#nv-dusk-host');
  const on = current.state === 'dark';
  const title = el('h2', { id: 'nv-dusk-title' }, on ? STRINGS.duskTitleOn : STRINGS.duskTitleOff);
  const sub = el('p', {}, on ? STRINGS.duskSubOn : STRINGS.duskSubOff);
  const input = el('input', { type: 'checkbox', id: 'nv-state', checked: on });
  const sw = el('label', { class: 'dusk-switch', 'aria-labelledby': 'nv-dusk-title' }, input,
    el('span', { class: 'sky' }, el('span', { class: 'stars' }, ...[1, 2, 3, 4].map(() => el('i'))), el('span', { class: 'orb' })));
  host.append(el('div', { class: 'dusk-copy' }, title, sub), sw);
  input.addEventListener('change', () => save({ state: input.checked ? 'dark' : 'light' }));
}

// ---- 首屏：主题三席 + 席位附属面板 ----
// 语义钉死（plan §3-1）：themeId 原值为 'adaptive'|'custom' 即归其席位（与
// themes.js USER_CSS_THEME_ID='custom' 同域）；其余值（含全部调色板 id）一律 classic 席。
function seatValue(themeId) {
  return themeId === 'adaptive' || themeId === 'custom' ? themeId : 'classic';
}
// 席位 radio 的 value 域（§3-2）：adaptive/custom 原值，classic 席落为首个调色板 id。
function seatRadioValue(themeId) {
  const v = seatValue(themeId);
  return v === 'classic' ? PALETTES[0].id : v;
}

let seatPanel = null; // 席位下方的附属面板容器（classic/custom/adaptive 三态）
let renderedPanel = null; // 当前已渲染的面板种类——变化时才整体重建

function renderThemeSeats() {
  const host = $('#sec-theme');
  host.append(secHead(STRINGS.sectionThemesLabel, STRINGS.themeSeatNote));
  const seats = el('div', { class: 'seats' });
  for (const card of SEAT_CARDS) {
    const value = card.themeId === 'classic' ? PALETTES[0].id : card.themeId;
    // classic 席位 radio 的 value 用首个调色板 id（themeId 值域约束）；三席单选互斥仍走 name 命名空间。
    seats.append(el('label', { class: 'seat' },
      el('input', { type: 'radio', name: 'themeId', value, checked: seatRadioValue(current.themeId) === value }),
      el('span', { class: 'seat-title' }, card.title),
      el('span', { class: 'seat-desc' }, card.desc)));
  }
  // classic 席已激活时其 radio 本就勾选，再点卡片不触发 change——不会把已选调色板重置回首列。
  seats.addEventListener('change', (e) => {
    if (e.target.name !== 'themeId') return;
    current = { ...current, themeId: e.target.value };
    save({ themeId: e.target.value });
    syncSeatPanel(current); // 预览态没有 storage 回声，也即时换面板
  });
  seatPanel = el('div', { id: 'seat-panel' });
  host.append(seats, seatPanel);
  renderedPanel = null;
  syncSeatPanel(current); // 渲染期决策：按当前 themeId 落面板
}

// 40 套调色板色板行：bg 内联样式，aria-pressed 标当前，点击存 themeId（§3-3）。
function swatchRow(activeId) {
  const row = el('div', { class: 'swatches' });
  for (const p of PALETTES) {
    // invert 家族没有 bg 色值，色板以中性深色占位（title 仍标真实款式名）。
    const sw = el('span', {
      class: 'swatch', title: p.label, 'data-palette': p.id,
      style: `background:${p.colors ? p.colors.bg : '#101014'}`,
      'aria-pressed': String(p.id === activeId),
    });
    sw.addEventListener('click', () => {
      current = { ...current, themeId: p.id };
      save({ themeId: p.id });
      syncSeatPanel(current);
    });
    row.append(sw);
  }
  return row;
}

// classic → .palette-pop 色板 / custom → userCss 编辑器（M3 Task 8/10 代码整体搬移）/
// adaptive → 容器隐藏。themeId 变化（渲染期或同步期）时重建面板内容。
function syncSeatPanel(s) {
  if (!seatPanel) return;
  const kind = seatValue(s.themeId);
  if (kind !== renderedPanel) {
    renderedPanel = kind;
    seatPanel.replaceChildren();
    if (kind === 'classic') {
      seatPanel.append(el('div', { class: 'palette-pop open' },
        el('div', { class: 'pop-label' }, STRINGS.paletteLabel), swatchRow(s.themeId)));
    } else if (kind === 'custom') {
      const ta = el('textarea', { id: 'usercss', rows: '12' }, s.userCss ?? '');
      // 原版 keyup 逐键保存（M3-BEHAVIOR §4.1）。
      ta.addEventListener('keyup', () => save({ userCss: ta.value }));
      wireEditor(ta);
      seatPanel.append(el('div', { class: 'palette-pop open' },
        el('p', { class: 'hint' }, STRINGS.userCssAreaLabel), ta, note(STRINGS.sectionUserCssNote)));
    }
  } else if (kind === 'classic') {
    for (const sw of seatPanel.querySelectorAll('.swatch')) {
      sw.setAttribute('aria-pressed', String(sw.getAttribute('data-palette') === s.themeId));
    }
  } else if (kind === 'custom') {
    const uc = seatPanel.querySelector('#usercss');
    if (uc && document.activeElement !== uc) uc.value = s.userCss ?? '';
  }
  seatPanel.hidden = kind === 'adaptive';
}

// ---- 首屏：色温组（M3 §6 控件逻辑整体迁入，ids 原样保留）----
// 设计稿移植（docs/superpowers/designs/2026-09-19-options-redesign-mockup.html）：
// 滑杆 --fill 百分比 + 预览圆点实时混色。
function fillSlider(input) {
  const p = (input.value - input.min) / (input.max - input.min) * 100;
  input.style.setProperty('--fill', `${p}%`);
}
function syncCtDot(ct) {
  const dot = document.getElementById('ct-dot');
  if (!dot) return;
  dot.style.background = `rgb(${ct.red} ${ct.green} ${ct.blue} / ${ct.opacity / 100})`;
  dot.style.opacity = ct.enabled ? 1 : 0.3;
}

function renderColorTemp() {
  const host = $('#sec-colortemp');
  host.append(secHead(STRINGS.colortempSectionLabel, STRINGS.colortempSectionNote));
  const ct = current.colorTemperature ?? {};
  const sliderRow = (id, label, max, value) => el('div', { class: 'row' },
    el('span', { class: 'row-label' }, label),
    el('input', { type: 'range', id, min: '0', max: String(max), step: '1', value }),
    el('output', { for: id }, String(value)));
  // 同 renderGuardControls 惯例：master 在它所 toggle 的 fieldset 外侧——disabled
  // fieldset 会连 re-enable 的开关一起禁掉。
  const enableRow = el('div', { class: 'row' },
    el('label', { class: 'inline-switch' },
      el('input', { type: 'checkbox', id: 'ct-enabled', checked: ct.enabled }),
      el('span', { class: 'track' }), el('span', { class: 'knob' })),
    el('span', { class: 'row-label' }, STRINGS.ctEnableLabel),
    el('span', { class: 'ct-dot', id: 'ct-dot', style: 'margin-left:auto' }));
  const controls = el('fieldset', { id: 'ct-controls', disabled: ct.enabled === false },
    sliderRow('ct-red', STRINGS.ctRedLabel, 255, ct.red),
    sliderRow('ct-green', STRINGS.ctGreenLabel, 255, ct.green),
    sliderRow('ct-blue', STRINGS.ctBlueLabel, 255, ct.blue),
    sliderRow('ct-opacity', STRINGS.ctOpacityLabel, 100, ct.opacity),
    el('p', { class: 'hint' }, STRINGS.ctListLabel),
    el('textarea', { id: 'ct-list', 'data-ct-list': '' }, (ct.excludedHosts ?? []).join('\n')),
    note(STRINGS.ctListHint));
  const box = el('div', {}, enableRow, controls);
  // 原版滑杆 input 实时存（§6.4）；列表 textarea change 存（nightveil 列表约定）。
  box.addEventListener('input', (e) => {
    if (e.target.type !== 'range') return;
    const k = { 'ct-red': 'red', 'ct-green': 'green', 'ct-blue': 'blue', 'ct-opacity': 'opacity' }[e.target.id];
    if (!k) return;
    const next = { ...(current.colorTemperature ?? {}), [k]: Number(e.target.value) };
    const out = box.querySelector(`output[for="${e.target.id}"]`);
    if (out) out.textContent = e.target.value;
    fillSlider(e.target);
    current = { ...current, colorTemperature: next };
    save({ colorTemperature: next });
    syncCtDot(next);
  });
  box.addEventListener('change', (e) => {
    if (e.target.id === 'ct-enabled') {
      const next = { ...(current.colorTemperature ?? {}), enabled: e.target.checked };
      current = { ...current, colorTemperature: next };
      save({ colorTemperature: next });
      document.getElementById('ct-controls').disabled = next.enabled === false;
      syncCtDot(next);
    } else if (e.target.id === 'ct-list') {
      const next = { ...(current.colorTemperature ?? {}), excludedHosts: parseHostList(e.target.value) };
      current = { ...current, colorTemperature: next };
      save({ colorTemperature: next });
    }
  });
  host.append(box); // 先挂载——syncCtDot/fillSlider 按 id/类查元素
  for (const node of controls.querySelectorAll('input[type="range"]')) fillSlider(node);
  syncCtDot(ct);
}

// ---- 首屏：定时组（M3 §3 逻辑整体迁入 + 时间行 .dimmed 联动）----
function renderScheduleSection() {
  const host = $('#sec-schedule');
  host.append(secHead(STRINGS.sectionScheduleLabel, STRINGS.sectionScheduleNote));
  const sch = current.schedule ?? {};
  const timeRow = el('div', { class: 'row', id: 'sch-times' },
    el('span', { class: 'row-label' }, STRINGS.scheduleOnLabel),
    el('input', { type: 'time', id: 'sch-on', value: sch.onTime }),
    el('span', { class: 'row-label' }, STRINGS.scheduleOffLabel),
    el('input', { type: 'time', id: 'sch-off', value: sch.offTime }));
  const enableRow = el('div', { class: 'row' },
    el('label', { class: 'inline-switch' },
      el('input', { type: 'checkbox', id: 'sch-enabled', checked: sch.enabled }),
      el('span', { class: 'track' }), el('span', { class: 'knob' })),
    el('span', { class: 'row-label' }, STRINGS.scheduleEnableLabel));
  const box = el('div', {}, enableRow, timeRow, note(STRINGS.sectionScheduleNote));
  const saveSchedule = (patch) => {
    const next = { ...(current.schedule ?? {}), ...patch };
    current = { ...current, schedule: next };
    save({ schedule: next });
  };
  const dimTimes = (enabled) => timeRow.classList.toggle('dimmed', !enabled);
  dimTimes(Boolean(sch.enabled));
  box.addEventListener('change', (e) => {
    if (e.target.id === 'sch-on') saveSchedule({ onTime: e.target.value });
    else if (e.target.id === 'sch-off') saveSchedule({ offTime: e.target.value });
    else if (e.target.id === 'sch-enabled') {
      if (e.target.checked && writable) {
        // 原版：勾选定时开关即请求 alarms 权限，拒绝则回退（M3-BEHAVIOR §3.1）。
        chrome.permissions.request({ permissions: ['alarms'] }, (granted) => {
          if (granted) { saveSchedule({ enabled: true }); dimTimes(true); }
          else {
            e.target.checked = false;
            window.alert(STRINGS.schedulePermissionAlert);
          }
        });
      } else {
        saveSchedule({ enabled: e.target.checked });
        dimTimes(e.target.checked);
      }
    }
  });
  host.append(box);
}

// ---- 首屏：站点组（siteMode 双选 ↔ inclusionMode；单 textarea 随模式换绑）----
function renderSites() {
  const host = $('#sec-sites');
  host.append(secHead(STRINGS.sitesSectionLabel, STRINGS.sitesSectionNote));
  const modeRow = el('div', { class: 'site-mode' },
    el('label', {}, el('input', { type: 'radio', name: 'siteMode', value: 'exclude', checked: !current.inclusionMode }), ` ${STRINGS.siteModeExcludeLabel}`),
    el('label', {}, el('input', { type: 'radio', name: 'siteMode', value: 'include', checked: Boolean(current.inclusionMode) }), ` ${STRINGS.siteModeIncludeLabel}`));
  const ta = el('textarea', { id: 'site-list', spellcheck: 'false' });
  const listText = (s, inclusionMode) => ((inclusionMode ? s.inclusionList : s.exclusionList) ?? []).join('\n');
  ta.value = listText(current, Boolean(current.inclusionMode));
  modeRow.addEventListener('change', (e) => {
    if (e.target.name !== 'siteMode') return;
    const inclusionMode = e.target.value === 'include';
    current = { ...current, inclusionMode };
    save({ inclusionMode });
    ta.value = listText(current, inclusionMode); // 切换即换绑到当前模式的列表
  });
  ta.addEventListener('change', () => {
    save({ [current.inclusionMode ? 'inclusionList' : 'exclusionList']: parseHostList(ta.value) });
  });
  host.append(el('div', {}, modeRow, ta, note(STRINGS.sitesHint)));
}

// ---- 高级折叠外壳（summary 文案来自 Task 2 键；开合态持久化 ui.sectionOpen.advanced）----
function renderAdvancedShell() {
  $('#adv-summary').append(
    el('span', { class: 'chev', 'aria-hidden': 'true' }, '▶'), // 装饰性几何符号，非文案
    STRINGS.advancedLabel,
    el('span', { class: 'count' }, STRINGS.advancedCountLabel));
  const details = $('#sec-advanced');
  details.open = Boolean(current.ui?.sectionOpen?.advanced);
  // toggle 在程序性赋值时也会触发——与当前快照同值时是同步回声，不落盘（同值早退依赖订阅回调先推进 current：sync 开头 current = s，排队的 toggle 处理器运行时快照已是新值）。
  details.addEventListener('toggle', () => {
    if (Boolean(current.ui?.sectionOpen?.advanced) === details.open) return;
    const next = { ...current.ui, sectionOpen: { advanced: details.open } };
    current = { ...current, ui: next };
    save({ ui: next });
  });
}

// ---- 高级：自适应引擎（M2c 控件机制原样；席位本身是首屏的自适应席卡片）----
function renderEngine() {
  // No master switch here: the seat is the first-screen adaptive seat card,
  // so the fieldset's disabled state derives from seatCheckboxState(themeId)
  // directly. fieldset disabled natively disables every control that lands
  // inside — same mechanism the page already trusts for grouped controls.
  const controls = el('fieldset', { id: 'eng-controls', disabled: !seatCheckboxState(current.themeId) });
  for (const g of ENGINE_GROUPS) {
    const host = el('div', { id: g.id }, el('p', { class: 'hint' }, g.label));
    if (g.id === 'eng-group-jkl') host.append(sitePolicyBox());
    for (const c of ENGINE_CONTROLS.filter((k) => k.host === g.id)) host.append(engineControl(c));
    if (g.id === 'eng-group-vars') {
      host.append(note(STRINGS.engineVariablesNote));
      for (const c of ENGINE_VARIABLE_CONTROLS) host.append(variableControl(c));
      host.append(extraRulesBox());
    }
    controls.append(host);
  }
  controls.addEventListener('change', onEngineControlChange);

  section('adv-engine', STRINGS.advEngineLabel, note(STRINGS.sectionEngineNote), controls);
}

// One §8 control row; values read from the last rendered settings snapshot.
function engineControl(c) {
  const value = engineValueAt(current.engine, c.path);
  if (c.type === 'checkbox') {
    return el('label', {}, el('input', { type: 'checkbox', id: c.id, checked: !!value }), ` ${c.label}`);
  }
  if (c.type === 'number') {
    return el('label', {}, `${c.label} `, el('input', {
      type: 'number', id: c.id, min: String(c.min), max: String(c.max), step: String(c.step ?? 1), value,
    }));
  }
  if (c.type === 'radio') {
    return el('label', {},
      el('input', { type: 'radio', name: c.name, id: c.id, value: c.value, checked: value === c.value }),
      ` ${c.label}`);
  }
  return el('label', {}, `${c.label} `, el('input', { type: 'text', id: c.id, size: '40', value: value ?? '' }));
}

// One §9 variable row: a picker for the color-valued variables, a free-text
// input for the rest, plus the --nv-* literal as technical copy next to the
// human label. A stored non-hex color displays the variable's default (display
// only — nothing is written back unless the user touches the picker).
function variableControl(c) {
  const name = c.path.slice('variables.'.length);
  const value = engineValueAt(current.engine, c.path);
  const input = c.type === 'color'
    ? el('input', { type: 'color', id: c.id, value: colorInputValue(value, ENGINE_VARIABLES[name]) })
    : el('input', { type: 'text', id: c.id, size: '40', value: value ?? '' });
  return el('label', {}, input, ` ${c.label} `, el('code', {}, name));
}

// §8 nativecssrules: verbatim textarea (empty = user cleared = no extra rules
// appended; only null/undefined mean the default template). Changes ride the
// fieldset's delegated autosave like every other engine control.
function extraRulesBox() {
  const c = ENGINE_EXTRA_RULES_CONTROL;
  const ta = el('textarea', { id: c.id, rows: '8' }, current.engine.extraRules ?? EXTRA_RULES_DEFAULT);
  wireEditor(ta);
  return el('div', {},
    el('label', { for: c.id }, c.label),
    ta,
    note(STRINGS.engineExtraRulesNote));
}

// m.3 (page-load) needs PerformanceLongTaskTiming; without it the original
// alerts and keeps m.2, saving nothing (M2-BEHAVIOR §0-④).
function acceptTuning(chosen) {
  const tuned = tuningFallback(typeof window.PerformanceLongTaskTiming !== 'undefined', chosen);
  if (tuned === chosen) return true;
  window.alert(STRINGS.engineTuningUnsupported);
  // Revert target derives from the shared table (the 'tuning' radio row whose
  // value is the effective choice) so renaming the id cannot break the fallback.
  const row = ENGINE_CONTROLS.find((k) => k.path === 'tuning' && k.value === tuned);
  const keep = row && document.getElementById(row.id);
  if (keep) keep.checked = true;
  return false;
}

// Delegated autosave for every §8/§9 control and the extraRules textarea
// (group hosts + the II-area pair): resolve by id, convert by type, write the
// whole engine group assembled from the current snapshot — advanced
// synchronously so rapid edits compose instead of clobbering each other
// before storage echoes back.
function onEngineControlChange(e) {
  const c = ENGINE_CONTROLS.find((k) => k.id === e.target.id)
    ?? ENGINE_VARIABLE_CONTROLS.find((k) => k.id === e.target.id)
    ?? (ENGINE_EXTRA_RULES_CONTROL.id === e.target.id ? ENGINE_EXTRA_RULES_CONTROL : null);
  if (!c) return false;
  if (c.type === 'radio' && !acceptTuning(e.target.value)) return true;
  const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  const value = controlValue(c, raw);
  if (value === null) return true; // cleared number field — storage waits for a real value
  const next = assembleEnginePatch(current.engine, c.path, value);
  current = { ...current, engine: next };
  save({ engine: next });
  return true;
}

// Site policy tri-state (respect / ignore / skip-compatible) → engine.siteThemePolicy.
function sitePolicyBox() {
  const box = el('div', {});
  for (const p of ENGINE_SITE_POLICIES) {
    box.append(el('label', {},
      el('input', {
        type: 'radio', name: 'siteThemePolicy', id: p.id, value: p.value,
        checked: current.engine.siteThemePolicy === p.value,
      }),
      ` ${p.label}`));
  }
  box.append(note(STRINGS.enginePolicyNote));
  box.addEventListener('change', (e) => {
    if (e.target.name === 'siteThemePolicy') {
      const next = { ...current.engine, siteThemePolicy: e.target.value };
      current = { ...current, engine: next };
      save({ engine: next });
    }
  });
  return box;
}

// ---- 高级：防白闪（M3 原样，#adv-guard 组）----
function renderGuard() {
  section('adv-guard', STRINGS.advGuardLabel, renderGuardControls());
}

// ---- M3 guard 控件（M3-BEHAVIOR §1，原样保留）----
function renderGuardControls() {
  const fg = current.flashGuard ?? {};
  // Master sits OUTSIDE the fieldset it toggles (renderColorTemp 同款惯例): a
  // disabled fieldset disables every descendant control, which would brick
  // re-enabling from inside.
  const master = el('label', {}, el('input', { type: 'checkbox', id: 'fg-enabled', checked: fg.enabled }), ` ${STRINGS.guardGroupLabel}`);
  const box = el('div', {}, master,
    el('fieldset', { id: 'fg-controls', disabled: fg.enabled === false },
      ...FLASHGUARD_MODES.map((m) => el('label', {},
        el('input', { type: 'radio', name: 'fgMode', id: `fg-mode-${m.value}`, value: m.value, checked: fg.mode === m.value }), ` ${m.label}`)),
      el('label', {}, `${STRINGS.guardDelayLabel} `, el('input', { type: 'number', id: 'fg-delay', min: '0', max: '10000', value: fg.delayMs })),
      el('label', {}, `${STRINGS.guardThresholdLabel} `, el('input', { type: 'number', id: 'fg-threshold', min: '1', max: '1000000', value: fg.threshold }))));
  box.addEventListener('change', (e) => {
    const next = { ...(current.flashGuard ?? {}) };
    if (e.target.id === 'fg-enabled') next.enabled = e.target.checked;
    else if (e.target.name === 'fgMode') next.mode = e.target.value;
    else if (e.target.id === 'fg-delay') next.delayMs = clampNumber(e.target.value, 0, 10000, current.flashGuard.delayMs);
    else if (e.target.id === 'fg-threshold') next.threshold = clampNumber(e.target.value, 1, 1000000, current.flashGuard.threshold);
    else return;
    if ((e.target.id === 'fg-delay' || e.target.id === 'fg-threshold') && e.target.value === '') return; // 空数字不落盘
    current = { ...current, flashGuard: next };
    save({ flashGuard: next });
    document.getElementById('fg-controls').disabled = next.enabled === false;
  });
  return box;
}

// ---- 高级：页面规则（M3 原样，#adv-rules 组，data-rule 委托照旧）----
function renderRules() {
  const r = current.exclusionRules ?? {};
  const rules = el('fieldset', {}, el('legend', {}, STRINGS.rulesLabel));
  rules.append(
    el('label', {}, el('input', { type: 'checkbox', 'data-rule': 'metaScheme', checked: r.metaScheme }), ` ${STRINGS.ruleMetaSchemeLabel}`),
    el('label', {}, el('input', { type: 'checkbox', 'data-rule': 'darkBackground', checked: r.darkBackground }), ` ${STRINGS.ruleDarkBackgroundLabel}`),
    el('label', {}, `${STRINGS.ruleBrightnessLabel} `, el('input', { type: 'number', min: '0', max: '255', 'data-rule': 'brightnessThreshold', value: r.brightnessThreshold ?? 50 })),
    el('label', {}, `${STRINGS.ruleHtmlAttributesLabel} `, el('input', { type: 'text', size: '40', 'data-rule': 'htmlAttributes', value: r.htmlAttributes ?? '' })),
    el('label', {}, `${STRINGS.ruleHtmlClassesLabel} `, el('input', { type: 'text', size: '40', 'data-rule': 'htmlClasses', value: r.htmlClasses ?? '' })),
    el('label', {}, `${STRINGS.ruleCookiesLabel} `, el('input', { type: 'text', size: '40', 'data-rule': 'cookies', value: r.cookies ?? '' })),
  );
  rules.addEventListener('change', (e) => {
    const key = e.target.getAttribute('data-rule');
    if (!key) return;
    const val = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'number' ? Math.max(0, Math.min(255, Number(e.target.value) || 0))
        : e.target.value;
    save({ exclusionRules: { ...(current.exclusionRules ?? {}), [key]: val } });
  });
  section('adv-rules', STRINGS.advRulesLabel, rules);
}

// 站点主题精修层开关（M3 Section I 的 sites 半区原样，#adv-misc 组内）。
function siteThemesBox() {
  const sites = el('fieldset', {}, el('legend', {}, STRINGS.siteThemesLabel));
  const siteBox = el('div', { class: 'cols' });
  for (const t of SITE_THEMES) {
    siteBox.append(el('label', {},
      el('input', { type: 'checkbox', 'data-site': t.id, checked: !(current.disabledSiteThemes ?? []).includes(t.id) }),
      ` ${t.label}`));
  }
  sites.append(siteBox, note(STRINGS.siteThemesNote));
  sites.addEventListener('change', (e) => {
    if (!e.target.getAttribute('data-site')) return;
    const disabled = [...sites.querySelectorAll('input[data-site]')]
      .filter((i) => !i.checked)
      .map((i) => i.getAttribute('data-site'));
    save({ disabledSiteThemes: disabled });
  });
  return sites;
}

// §6.1 字号：number 10-22，change 存，--font-size 变量即时应用。
function renderFontSizeControl() {
  const input = el('input', { type: 'number', id: 'ui-fontsize', min: '10', max: '22', step: '1', value: current.ui?.fontSize ?? 13 });
  const row = el('label', {}, `${STRINGS.fontSizeLabel} `, input);
  input.addEventListener('change', () => {
    if (input.value === '') return; // 空数字不落盘
    const v = clampNumber(input.value, 10, 22, current.ui.fontSize);
    const next = { ...current.ui, fontSize: v };
    current = { ...current, ui: next };
    save({ ui: next });
  });
  return row;
}

// ---- 高级：杂项（行为残项 + 挂载开关/字号 + 站点主题 + 排除/包含完整列表；
// #adv-misc 组，列表是首屏站点卡当前模式的完整版备份视图）----
function renderMisc() {
  // 行为残项：II-area engine 键（复查对，随引擎席位禁用）。
  const behavior = el('fieldset', { id: ENGINE_BEHAVIOR_HOST }, el('legend', {}, STRINGS.behaviorLabel));
  // II-area engine keys per §8: the recheck pair. They disable with the seat —
  // no engine, no effect (sync re-derives this like the #eng-controls fieldset).
  for (const c of ENGINE_CONTROLS.filter((k) => k.host === ENGINE_BEHAVIOR_HOST)) {
    const row = engineControl(c);
    row.querySelector('input').disabled = !seatCheckboxState(current.themeId);
    behavior.append(row);
  }
  behavior.addEventListener('change', (e) => {
    if (onEngineControlChange(e)) return;
    if (e.target.getAttribute('data-key')) save({ [e.target.getAttribute('data-key')]: e.target.checked });
  });

  const mount = el('fieldset', {},
    el('label', {}, el('input', { type: 'checkbox', 'data-m3key': 'documentRoot', checked: current.documentRoot }), ` ${STRINGS.documentRootLabel}`),
    el('label', {}, el('input', { type: 'checkbox', 'data-m3key': 'reattachStyles', checked: current.reattachStyles }), ` ${STRINGS.reattachStylesLabel}`),
    renderFontSizeControl());
  // data-m3key 委托在此补上：原 renderBehavior 的监听挂在行为 fieldset 上，而挂载
  // fieldset 是其兄弟——documentRoot/reattachStyles 的改动此前落不了盘。
  mount.addEventListener('change', (e) => {
    if (e.target.getAttribute('data-m3key')) save({ [e.target.getAttribute('data-m3key')]: e.target.checked });
  });

  // 排除/包含完整列表：首屏站点卡的完整版备份视图（两份都可见可编辑，
  // 不随 siteMode 换绑）。data-list 委托语义照旧：去空去重后整表落盘。
  const listBox = (key, labelText) => {
    const ta = el('textarea', { 'data-list': key }, (current[key] ?? []).join('\n'));
    ta.addEventListener('change', () => {
      const list = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
      save({ [key]: [...new Set(list)] });
    });
    return el('div', {}, el('p', { class: 'hint' }, labelText), ta, note(STRINGS.listEditHint));
  };

  section('adv-misc', STRINGS.advMiscLabel, behavior, mount, siteThemesBox(),
    listBox('exclusionList', STRINGS.exclusionListLabel),
    listBox('inclusionList', STRINGS.inclusionListLabel));
}

// ---- Reset ----
function wireReset() {
  const btn = $('#reset');
  btn.textContent = STRINGS.resetButton;
  btn.addEventListener('click', () => save({ ...DEFAULT_SETTINGS }));
}

// ---- storage-driven sync (external changes while the page stays open) ----
function syncFromSettings(s) {
  current = s;
  // ---- 首屏 ----
  // 天际线开关勾选态 + 标题/副标文案互换。
  const nvState = document.getElementById('nv-state');
  if (nvState) nvState.checked = s.state === 'dark';
  const duskTitle = document.getElementById('nv-dusk-title');
  if (duskTitle) {
    const on = s.state === 'dark';
    duskTitle.textContent = on ? STRINGS.duskTitleOn : STRINGS.duskTitleOff;
    duskTitle.nextElementSibling.textContent = on ? STRINGS.duskSubOn : STRINGS.duskSubOff;
  }
  // 三席 radio（name=themeId 现在只剩席位）按席位值域重派。
  for (const i of document.querySelectorAll('#sec-theme input[name="themeId"]')) {
    i.checked = i.value === seatRadioValue(s.themeId);
  }
  syncSeatPanel(s);
  // 色温逐 id 重派（activeElement 守卫照旧）+ 圆点/--fill 联动。
  const ctNode = document.getElementById('ct-enabled');
  if (ctNode) {
    const ct = s.colorTemperature ?? {};
    ctNode.checked = Boolean(ct.enabled);
    document.getElementById('ct-controls').disabled = !ct.enabled;
    for (const [id, k] of [['ct-red', 'red'], ['ct-green', 'green'], ['ct-blue', 'blue'], ['ct-opacity', 'opacity']]) {
      const node = document.getElementById(id);
      if (node && document.activeElement !== node) {
        node.value = ct[k];
        fillSlider(node);
        const out = document.querySelector(`output[for="${id}"]`);
        if (out) out.textContent = String(ct[k]);
      }
    }
    syncCtDot(ct);
    const list = document.getElementById('ct-list');
    if (list && document.activeElement !== list) list.value = (ct.excludedHosts ?? []).join('\n');
  }
  // 定时：勾选态 + 时间行 .dimmed 联动 + 时间值重派。
  const schNode = document.getElementById('sch-enabled');
  if (schNode) {
    schNode.checked = Boolean(s.schedule?.enabled);
    document.getElementById('sch-times')?.classList.toggle('dimmed', !s.schedule?.enabled);
    const schOn = document.getElementById('sch-on');
    if (schOn && document.activeElement !== schOn) schOn.value = s.schedule?.onTime ?? '';
    const off = document.getElementById('sch-off');
    if (off && document.activeElement !== off) off.value = s.schedule?.offTime ?? '';
  }
  // 站点：模式 radio + 当前模式对应列表重派。
  for (const i of document.querySelectorAll('#sec-sites input[name="siteMode"]')) {
    i.checked = (i.value === 'include') === Boolean(s.inclusionMode);
  }
  const siteList = document.getElementById('site-list');
  if (siteList && document.activeElement !== siteList) {
    siteList.value = ((s.inclusionMode ? s.inclusionList : s.exclusionList) ?? []).join('\n');
  }
  // ---- 高级 ----
  // 折叠开合态从存储重派（程序性赋值触发的 toggle 与快照同值，不会再落盘）。
  const adv = document.getElementById('sec-advanced');
  if (adv) adv.open = Boolean(s.ui?.sectionOpen?.advanced);
  // The seat is the first-screen adaptive seat card; #eng-controls derives
  // from it directly (fieldset disabled covers the whole group).
  const controls = document.querySelector('#eng-controls');
  if (controls) controls.disabled = !seatCheckboxState(s.themeId);
  for (const i of document.querySelectorAll('#adv-engine input[name="siteThemePolicy"]')) {
    i.checked = i.value === s.engine.siteThemePolicy;
  }
  // §8 controls re-derive from the merged engine group; the misc-area pair also
  // follows the seat (#eng-controls' fieldset disabled covers the rest).
  for (const c of ENGINE_CONTROLS) {
    const node = document.getElementById(c.id);
    if (!node) continue;
    if (c.host === ENGINE_BEHAVIOR_HOST) node.disabled = !seatCheckboxState(s.themeId);
    const v = engineValueAt(s.engine, c.path);
    if (node.type === 'checkbox') node.checked = !!v;
    else if (node.type === 'radio') node.checked = node.value === v;
    else if (document.activeElement !== node) node.value = v ?? '';
  }
  // §9 variables re-derive like the §8 rows; color inputs show the default
  // color when the stored value is not a #rrggbb hex.
  for (const c of ENGINE_VARIABLE_CONTROLS) {
    const node = document.getElementById(c.id);
    if (!node || document.activeElement === node) continue;
    const v = engineValueAt(s.engine, c.path);
    node.value = c.type === 'color'
      ? colorInputValue(v, ENGINE_VARIABLES[c.path.slice('variables.'.length)])
      : v ?? '';
  }
  const extra = document.getElementById(ENGINE_EXTRA_RULES_CONTROL.id);
  if (extra && document.activeElement !== extra) extra.value = s.engine.extraRules ?? EXTRA_RULES_DEFAULT;
  for (const i of document.querySelectorAll('#adv-misc input[data-site]')) {
    i.checked = !(s.disabledSiteThemes ?? []).includes(i.getAttribute('data-site'));
  }
  for (const i of document.querySelectorAll('#adv-misc input[data-key]')) {
    i.checked = !!s[i.getAttribute('data-key')];
  }
  const r = s.exclusionRules ?? {};
  for (const i of document.querySelectorAll('#adv-rules [data-rule]')) {
    const key = i.getAttribute('data-rule');
    if (i.type === 'checkbox') i.checked = !!r[key];
    else if (document.activeElement !== i) i.value = r[key] ?? '';
  }
  for (const ta of document.querySelectorAll('#adv-misc textarea[data-list]')) {
    if (document.activeElement !== ta) ta.value = (s[ta.getAttribute('data-list')] ?? []).join('\n');
  }
  // ---- M3 sync ----
  applyFontSize(s.ui?.fontSize ?? 13);
  const fgNode = document.getElementById('fg-enabled');
  if (fgNode) {
    const fg = s.flashGuard ?? {};
    fgNode.checked = fg.enabled !== false;
    document.getElementById('fg-controls').disabled = fg.enabled === false;
    for (const i of document.querySelectorAll('input[name="fgMode"]')) i.checked = i.value === fg.mode;
    if (document.activeElement?.id !== 'fg-delay') document.getElementById('fg-delay').value = fg.delayMs;
    if (document.activeElement?.id !== 'fg-threshold') document.getElementById('fg-threshold').value = fg.threshold;
  }
  for (const i of document.querySelectorAll('#adv-misc input[data-m3key]')) {
    i.checked = Boolean(s[i.getAttribute('data-m3key')]);
  }
  const fs = document.getElementById('ui-fontsize');
  if (fs && document.activeElement !== fs) fs.value = s.ui?.fontSize ?? 13;
}

function applyFontSize(v) {
  document.documentElement.style.setProperty('--font-size', `${v}px`);
}

function renderAll() {
  renderDusk();
  renderThemeSeats();
  renderColorTemp();
  renderScheduleSection();
  renderSites();
  renderAdvancedShell();
  renderEngine();
  renderGuard();
  renderRules();
  renderMisc();
  applyFontSize(current.ui?.fontSize ?? 13);
}

function render() {
  wireReset();
  if (storageAvailable()) {
    writable = true;
    loadSettings()
      .then((s) => { current = s; renderAll(); subscribeSettings(syncFromSettings); })
      .catch((e) => console.error(STRINGS.optionsSaveError, e));
  } else {
    current = { ...DEFAULT_SETTINGS };
    renderAll();
    document.querySelector('main').setAttribute('data-preview', '');
    document.querySelector('main').prepend(note(STRINGS.optionsPreviewNote));
  }
}

render();
