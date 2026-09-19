// src/options/main.js
// Seven-section options page (I themes / II options / III user-css / IV
// engine / V exclusion / VI inclusion / VII schedule). All copy comes from
// shared/strings.js; control data from palettes/siteThemes. Edits autosave
// via saveSettings; storage.onChanged keeps open pages in sync. When
// chrome.storage is unavailable (http fixture mount) the page renders a
// disabled preview from defaults so rendering stays verifiable.
import { STRINGS } from '../shared/strings.js';
import {
  DEFAULT_SETTINGS, defaultStorage, loadSettings, saveSettings, subscribeSettings,
} from '../shared/settings.js';
import { PALETTES } from '../shared/palettes.js';
import { SITE_THEMES } from '../shared/siteThemes.js';
import {
  SEAT_THEME_ID, seatCheckboxState, ENGINE_GROUPS, ENGINE_SITE_POLICIES,
  ENGINE_CONTROLS, ENGINE_BEHAVIOR_HOST, ENGINE_VARIABLE_CONTROLS,
  ENGINE_EXTRA_RULES_CONTROL, colorInputValue, assembleEnginePatch,
  controlValue, tuningFallback, engineValueAt,
} from '../shared/optionsEngine.js';
import { ENGINE_VARIABLES, EXTRA_RULES_DEFAULT } from '../shared/engineTheme.js';
import { SECTION_ORDER, sectionKeyOf, FLASHGUARD_MODES, parseHostList, clampNumber } from '../shared/optionsM3.js';
import { USER_CSS_THEME_ID } from '../shared/themes.js';
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

function section(id, summaryText, ...body) {
  $(`#${id}`).append(el('summary', {}, summaryText), ...body);
}

function note(text) { return el('p', { class: 'hint' }, text); }

function storageAvailable() {
  try { defaultStorage(); return true; } catch { return false; }
}

let writable = false;
let current = { ...DEFAULT_SETTINGS };

function save(patch) {
  if (writable) saveSettings(patch).catch((e) => console.error(STRINGS.optionsSaveError, e));
}

// ---- Section I: themes ----
function renderThemes() {
  const families = [
    [STRINGS.overlayFamilyLabel, PALETTES.filter((p) => p.family === 'overlay')],
    [STRINGS.invertFamilyLabel, PALETTES.filter((p) => p.family === 'invert')],
  ];
  const classic = el('fieldset', {}, el('legend', {}, STRINGS.classicThemeLabel));
  for (const [label, palettes] of families) {
    const group = el('div', { class: 'cols' });
    for (const p of palettes) {
      group.append(el('label', {},
        el('input', { type: 'radio', name: 'themeId', value: p.id, checked: current.themeId === p.id }),
        ` ${p.label}`));
    }
    classic.append(el('p', { class: 'hint' }, label), group);
  }
  classic.append(el('p', { class: 'hint' }, STRINGS.customThemeLabel), el('div', { class: 'cols' },
    el('label', {}, el('input', { type: 'radio', name: 'themeId', value: USER_CSS_THEME_ID, checked: current.themeId === USER_CSS_THEME_ID }), ` ${STRINGS.customThemeLabel}`)));
  classic.addEventListener('change', (e) => {
    if (e.target.name === 'themeId') save({ themeId: e.target.value });
  });

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

  section('sec-themes', STRINGS.sectionThemesLabel, classic, sites);
}

// ---- M3 sections/controls（M3-BEHAVIOR §1/§2/§3/§6）----
function renderGuardControls() {
  const fg = current.flashGuard ?? {};
  const master = el('label', {}, el('input', { type: 'checkbox', id: 'fg-enabled', checked: fg.enabled }), ` ${STRINGS.guardGroupLabel}`);
  const box = el('fieldset', { id: 'fg-controls', disabled: fg.enabled === false }, master,
    ...FLASHGUARD_MODES.map((m) => el('label', {},
      el('input', { type: 'radio', name: 'fgMode', id: `fg-mode-${m.value}`, value: m.value, checked: fg.mode === m.value }), ` ${m.label}`)),
    el('label', {}, `${STRINGS.guardDelayLabel} `, el('input', { type: 'number', id: 'fg-delay', min: '0', max: '10000', value: fg.delayMs })),
    el('label', {}, `${STRINGS.guardThresholdLabel} `, el('input', { type: 'number', id: 'fg-threshold', min: '1', max: '1000000', value: fg.threshold })));
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

function renderColorTempControls() {
  const ct = current.colorTemperature ?? {};
  const slider = (id, label, max, value) => el('label', {}, `${label} `,
    el('input', { type: 'range', id, min: '0', max: String(max), step: '1', value }), ' ',
    el('output', { for: id }, String(value)));
  const master = el('label', {}, el('input', { type: 'checkbox', id: 'ct-enabled', checked: ct.enabled }), ` ${STRINGS.colorTempGroupLabel}`);
  const box = el('fieldset', { id: 'ct-controls', disabled: ct.enabled === false }, master,
    slider('ct-red', STRINGS.ctRedLabel, 255, ct.red),
    slider('ct-green', STRINGS.ctGreenLabel, 255, ct.green),
    slider('ct-blue', STRINGS.ctBlueLabel, 255, ct.blue),
    slider('ct-opacity', STRINGS.ctOpacityLabel, 100, ct.opacity),
    el('p', { class: 'hint' }, STRINGS.ctListLabel),
    el('textarea', { id: 'ct-list', 'data-ct-list': '' }, (ct.excludedHosts ?? []).join('\n')),
    note(STRINGS.ctListHint));
  // 原版滑杆 input 实时存（§6.4）；列表 textarea change 存（nightveil 列表约定）。
  box.addEventListener('input', (e) => {
    if (e.target.type !== 'range') return;
    const next = { ...(current.colorTemperature ?? {}) };
    const k = { 'ct-red': 'red', 'ct-green': 'green', 'ct-blue': 'blue', 'ct-opacity': 'opacity' }[e.target.id];
    if (!k) return;
    next[k] = Number(e.target.value);
    const out = box.querySelector(`output[for="${e.target.id}"]`);
    if (out) out.textContent = e.target.value;
    current = { ...current, colorTemperature: next };
    save({ colorTemperature: next });
  });
  box.addEventListener('change', (e) => {
    if (e.target.id === 'ct-enabled') {
      const next = { ...(current.colorTemperature ?? {}), enabled: e.target.checked };
      current = { ...current, colorTemperature: next };
      save({ colorTemperature: next });
      document.getElementById('ct-controls').disabled = next.enabled === false;
    } else if (e.target.id === 'ct-list') {
      const next = { ...(current.colorTemperature ?? {}), excludedHosts: parseHostList(e.target.value) };
      current = { ...current, colorTemperature: next };
      save({ colorTemperature: next });
    }
  });
  return box;
}

function renderUserCssSection() {
  const ta = el('textarea', { id: 'usercss', rows: '12' }, current.userCss ?? '');
  const box = el('div', {}, el('p', { class: 'hint' }, STRINGS.userCssAreaLabel), ta, note(STRINGS.sectionUserCssNote));
  // 原版 keyup 逐键保存（M3-BEHAVIOR §4.1）。
  ta.addEventListener('keyup', () => save({ userCss: ta.value }));
  wireEditor(ta);
  section('sec-usercss', STRINGS.sectionUserCssLabel, box);
}

function renderScheduleSection() {
  const sch = current.schedule ?? {};
  const box = el('fieldset', {},
    el('label', {}, el('input', { type: 'checkbox', id: 'sch-enabled', checked: sch.enabled }), ` ${STRINGS.sectionScheduleLabel}`),
    el('label', {}, `${STRINGS.scheduleOnLabel} `, el('input', { type: 'time', id: 'sch-on', value: sch.onTime })),
    el('label', {}, `${STRINGS.scheduleOffLabel} `, el('input', { type: 'time', id: 'sch-off', value: sch.offTime })),
    note(STRINGS.sectionScheduleNote));
  const saveSchedule = (patch) => {
    const next = { ...(current.schedule ?? {}), ...patch };
    current = { ...current, schedule: next };
    save({ schedule: next });
  };
  box.addEventListener('change', (e) => {
    if (e.target.id === 'sch-on') saveSchedule({ onTime: e.target.value });
    else if (e.target.id === 'sch-off') saveSchedule({ offTime: e.target.value });
    else if (e.target.id === 'sch-enabled') {
      if (e.target.checked && writable) {
        // 原版：勾选定时开关即请求 alarms 权限，拒绝则回退（M3-BEHAVIOR §3.1）。
        chrome.permissions.request({ permissions: ['alarms'] }, (granted) => {
          if (granted) { saveSchedule({ enabled: true }); }
          else {
            e.target.checked = false;
            window.alert(STRINGS.schedulePermissionAlert);
          }
        });
      } else {
        saveSchedule({ enabled: e.target.checked });
      }
    }
  });
  section('sec-schedule', STRINGS.sectionScheduleLabel, box);
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

// §6.2 分区折叠持久化：details toggle → ui.sectionOpen 补丁。
function applySectionState() {
  for (const id of SECTION_ORDER) {
    const d = document.getElementById(id);
    if (!d) continue;
    d.open = Boolean(current.ui?.sectionOpen?.[sectionKeyOf(id)]);
    d.addEventListener('toggle', () => {
      if (!writable) return;
      const next = { ...current.ui, sectionOpen: { ...(current.ui?.sectionOpen ?? {}), [sectionKeyOf(id)]: d.open } };
      current = { ...current, ui: next };
      save({ ui: next });
    });
  }
}
function applyFontSize(v) {
  document.documentElement.style.setProperty('--font-size', `${v}px`);
}

// ---- Section IV: adaptive engine (the §8 sub-option controls render from
// shared/optionsEngine.js ENGINE_CONTROLS, the §9 variables from
// ENGINE_VARIABLE_CONTROLS, extraRules from ENGINE_EXTRA_RULES_CONTROL) ----
function renderEngine() {
  // Seat master switch: checked ⟺ themeId === 'adaptive'. Unchecking hands
  // the seat to the first classic theme — some theme must stay selected
  // (original dark_41 semantics; picking a section-I radio does the same).
  const seat = el('label', {},
    el('input', { type: 'checkbox', id: 'eng-seat', checked: seatCheckboxState(current.themeId) }),
    ` ${STRINGS.engineSeatLabel}`);
  seat.addEventListener('change', (e) => {
    save({ themeId: e.target.checked ? SEAT_THEME_ID : PALETTES[0].id });
  });

  // fieldset disabled natively disables every control that lands inside —
  // same mechanism the page already trusts for grouped controls.
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

  section('sec-engine', STRINGS.sectionEngineLabel, seat, note(STRINGS.sectionEngineNote), controls);
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

// ---- Section II: options (behavior + exclusion rules) ----
function renderBehavior() {
  const box = el('fieldset', { id: ENGINE_BEHAVIOR_HOST }, el('legend', {}, STRINGS.behaviorLabel));
  box.append(
    el('label', {}, el('input', { type: 'radio', name: 'state', value: 'light', checked: current.state === 'light' }), ` ${STRINGS.stateLightLabel}`),
    el('label', {}, el('input', { type: 'radio', name: 'state', value: 'dark', checked: current.state === 'dark' }), ` ${STRINGS.stateDarkLabel}`),
    el('label', {}, el('input', { type: 'checkbox', 'data-key': 'inclusionMode', checked: current.inclusionMode }), ` ${STRINGS.inclusionModeLabel}`),
    note(STRINGS.inclusionModeNote),
    el('label', {}, el('input', { type: 'checkbox', 'data-key': 'perSiteToggle', checked: current.perSiteToggle }), ` ${STRINGS.perSiteToggleLabel}`),
  );
  // II-area engine keys per §8: the recheck pair. They disable with the seat —
  // no engine, no effect (sync re-derives this like the #eng-controls fieldset).
  for (const c of ENGINE_CONTROLS.filter((k) => k.host === ENGINE_BEHAVIOR_HOST)) {
    const row = engineControl(c);
    row.querySelector('input').disabled = !seatCheckboxState(current.themeId);
    box.append(row);
  }
  box.addEventListener('change', (e) => {
    if (onEngineControlChange(e)) return;
    if (e.target.name === 'state') save({ state: e.target.value });
    else if (e.target.getAttribute('data-key')) save({ [e.target.getAttribute('data-key')]: e.target.checked });
    else if (e.target.getAttribute('data-m3key')) save({ [e.target.getAttribute('data-m3key')]: e.target.checked });
  });

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

  section('sec-options', STRINGS.sectionOptionsLabel,
    box, rules,
    renderGuardControls(),
    renderColorTempControls(),
    el('fieldset', {},
      el('label', {}, el('input', { type: 'checkbox', 'data-m3key': 'documentRoot', checked: current.documentRoot }), ` ${STRINGS.documentRootLabel}`),
      el('label', {}, el('input', { type: 'checkbox', 'data-m3key': 'reattachStyles', checked: current.reattachStyles }), ` ${STRINGS.reattachStylesLabel}`),
      renderFontSizeControl()));
}

// ---- Sections V / VI: hostname lists ----
function renderListSection(id, summary, key, labelText) {
  const ta = el('textarea', { 'data-list': key }, (current[key] ?? []).join('\n'));
  const box = el('div', {}, el('p', { class: 'hint' }, labelText), ta, note(STRINGS.listEditHint));
  ta.addEventListener('change', () => {
    const list = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
    save({ [key]: [...new Set(list)] });
  });
  section(id, summary, box);
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
  // The seat checkbox and the palette radios share the themeId namespace, so
  // every radio is re-derived from settings: a stale check clears when the
  // other side takes the seat (no radio has value 'adaptive').
  for (const i of document.querySelectorAll('#sec-themes input[name="themeId"]')) {
    i.checked = i.value === s.themeId;
  }
  const seat = document.querySelector('#eng-seat');
  if (seat) seat.checked = seatCheckboxState(s.themeId);
  const controls = document.querySelector('#eng-controls');
  if (controls) controls.disabled = !seatCheckboxState(s.themeId);
  for (const i of document.querySelectorAll('#sec-engine input[name="siteThemePolicy"]')) {
    i.checked = i.value === s.engine.siteThemePolicy;
  }
  // §8 controls re-derive from the merged engine group; the II-area pair also
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
  for (const i of document.querySelectorAll('#sec-themes input[data-site]')) {
    i.checked = !(s.disabledSiteThemes ?? []).includes(i.getAttribute('data-site'));
  }
  const stateRadio = document.querySelector(`#sec-options input[name="state"][value="${s.state}"]`);
  if (stateRadio) stateRadio.checked = true;
  for (const i of document.querySelectorAll('#sec-options input[data-key]')) {
    i.checked = !!s[i.getAttribute('data-key')];
  }
  const r = s.exclusionRules ?? {};
  for (const i of document.querySelectorAll('#sec-options [data-rule]')) {
    const key = i.getAttribute('data-rule');
    if (i.type === 'checkbox') i.checked = !!r[key];
    else if (document.activeElement !== i) i.value = r[key] ?? '';
  }
  for (const ta of document.querySelectorAll('textarea[data-list]')) {
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
  const ctNode = document.getElementById('ct-enabled');
  if (ctNode) {
    const ct = s.colorTemperature ?? {};
    ctNode.checked = Boolean(ct.enabled);
    document.getElementById('ct-controls').disabled = !ct.enabled;
    for (const [id, k] of [['ct-red', 'red'], ['ct-green', 'green'], ['ct-blue', 'blue'], ['ct-opacity', 'opacity']]) {
      const node = document.getElementById(id);
      if (node && document.activeElement !== node) {
        node.value = ct[k];
        const out = document.querySelector(`output[for="${id}"]`);
        if (out) out.textContent = String(ct[k]);
      }
    }
    const list = document.getElementById('ct-list');
    if (list && document.activeElement !== list) list.value = (ct.excludedHosts ?? []).join('\n');
  }
  const schOn = document.getElementById('sch-on');
  if (schOn) {
    document.getElementById('sch-enabled').checked = Boolean(s.schedule?.enabled);
    if (document.activeElement !== schOn) schOn.value = s.schedule?.onTime ?? '';
    const off = document.getElementById('sch-off');
    if (off && document.activeElement !== off) off.value = s.schedule?.offTime ?? '';
  }
  const uc = document.getElementById('usercss');
  if (uc && document.activeElement !== uc) uc.value = s.userCss ?? '';
  for (const i of document.querySelectorAll('#sec-options input[data-m3key]')) {
    i.checked = Boolean(s[i.getAttribute('data-m3key')]);
  }
  const fs = document.getElementById('ui-fontsize');
  if (fs && document.activeElement !== fs) fs.value = s.ui?.fontSize ?? 13;
  for (const id of SECTION_ORDER) {
    const d = document.getElementById(id);
    if (d) d.open = Boolean(s.ui?.sectionOpen?.[sectionKeyOf(id)]);
  }
}

function renderAll() {
  renderThemes();
  renderBehavior();
  renderListSection('sec-exclusion', STRINGS.sectionExclusionLabel, 'exclusionList', STRINGS.exclusionListLabel);
  renderListSection('sec-inclusion', STRINGS.sectionInclusionLabel, 'inclusionList', STRINGS.inclusionListLabel);
  renderEngine();
  renderUserCssSection();
  renderScheduleSection();
  applySectionState();
  applyFontSize(current.ui?.fontSize ?? 13);
}

function render() {
  $('#heading').textContent = STRINGS.optionsHeading;
  $('#note').textContent = STRINGS.optionsNote;
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
    $('#note').textContent = STRINGS.optionsPreviewNote;
  }
}

render();
