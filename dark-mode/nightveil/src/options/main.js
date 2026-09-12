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
}

function renderAll() {
  renderThemes();
  renderPlaceholders();
  // Sections II / V / VI land in the next task.
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
