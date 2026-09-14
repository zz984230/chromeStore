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

// ---- Placeholder sections (III / VII) ----
function renderPlaceholders() {
  section('sec-usercss', STRINGS.sectionUserCssLabel, note(STRINGS.sectionUserCssNote));
  section('sec-schedule', STRINGS.sectionScheduleLabel, note(STRINGS.sectionScheduleNote));
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
  return el('div', {},
    el('label', { for: c.id }, c.label),
    el('textarea', { id: c.id, rows: '8' }, current.engine.extraRules ?? EXTRA_RULES_DEFAULT),
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
  const next = assembleEnginePatch(current.engine, c.path, controlValue(c, raw));
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

  section('sec-options', STRINGS.sectionOptionsLabel, box, rules);
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
}

function renderAll() {
  renderThemes();
  renderBehavior();
  renderListSection('sec-exclusion', STRINGS.sectionExclusionLabel, 'exclusionList', STRINGS.exclusionListLabel);
  renderListSection('sec-inclusion', STRINGS.sectionInclusionLabel, 'inclusionList', STRINGS.inclusionListLabel);
  renderEngine();
  renderPlaceholders();
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
