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

// ---- Placeholder sections (III / IV / VII) ----
function renderPlaceholders() {
  section('sec-usercss', STRINGS.sectionUserCssLabel, note(STRINGS.sectionUserCssNote));
  section('sec-engine', STRINGS.sectionEngineLabel, note(STRINGS.sectionEngineNote));
  section('sec-schedule', STRINGS.sectionScheduleLabel, note(STRINGS.sectionScheduleNote));
}

// ---- Section II: options (behavior + exclusion rules) ----
function renderBehavior() {
  const box = el('fieldset', {}, el('legend', {}, STRINGS.behaviorLabel));
  box.append(
    el('label', {}, el('input', { type: 'radio', name: 'state', value: 'light', checked: current.state === 'light' }), ` ${STRINGS.stateLightLabel}`),
    el('label', {}, el('input', { type: 'radio', name: 'state', value: 'dark', checked: current.state === 'dark' }), ` ${STRINGS.stateDarkLabel}`),
    el('label', {}, el('input', { type: 'checkbox', 'data-key': 'inclusionMode', checked: current.inclusionMode }), ` ${STRINGS.inclusionModeLabel}`),
    note(STRINGS.inclusionModeNote),
    el('label', {}, el('input', { type: 'checkbox', 'data-key': 'perSiteToggle', checked: current.perSiteToggle }), ` ${STRINGS.perSiteToggleLabel}`),
  );
  box.addEventListener('change', (e) => {
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
  const radio = document.querySelector(`#sec-themes input[name="themeId"][value="${s.themeId}"]`);
  if (radio) radio.checked = true;
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
