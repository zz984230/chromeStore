// tests/unit/options-engine.test.mjs
// Engine section (IV) skeleton: seat master switch, site policy tri-state,
// group hosts. src/options/main.js renders on import (side effects), so node
// --test cannot load it — the decisions live in shared/optionsEngine.js and
// the DOM wiring is pinned with the same source-text assertions the
// strings-source test uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SEAT_THEME_ID, seatCheckboxState, ENGINE_GROUPS, ENGINE_SITE_POLICIES,
  ENGINE_CONTROLS, ENGINE_CONTROL_IDS, ENGINE_BEHAVIOR_HOST,
  assembleEnginePatch, controlValue, tuningFallback, engineValueAt,
} from '../../src/shared/optionsEngine.js';
import { STRINGS } from '../../src/shared/strings.js';
import { PALETTES } from '../../src/shared/palettes.js';
import { engineDefaults } from '../../src/content/engine/contract.js';

const mainSrc = readFileSync(new URL('../../src/options/main.js', import.meta.url), 'utf8');

test('seatCheckboxState truth table — true only for the adaptive seat', () => {
  assert.equal(SEAT_THEME_ID, 'adaptive');
  assert.equal(seatCheckboxState('adaptive'), true);
  assert.equal(seatCheckboxState('nv-midnight'), false);
  for (const p of PALETTES) assert.equal(seatCheckboxState(p.id), false, p.id);
  assert.equal(seatCheckboxState(undefined), false);
  assert.equal(seatCheckboxState(null), false);
  assert.equal(seatCheckboxState(''), false);
});

test('engine group hosts: six ids in render order, labels from strings.js', () => {
  assert.deepEqual(ENGINE_GROUPS.map((g) => g.id), [
    'eng-group-a', 'eng-group-b', 'eng-group-cde',
    'eng-group-fghi', 'eng-group-jkl', 'eng-group-mn',
  ]);
  const stringValues = Object.values(STRINGS);
  for (const g of ENGINE_GROUPS) {
    assert.equal(typeof g.label, 'string');
    assert.ok(g.label.length > 0);
    assert.ok(stringValues.includes(g.label), `group label must be a STRINGS entry: ${g.label}`);
  }
});

test('site policy tri-state: ids, values and labels; default lives in engineDefaults', () => {
  assert.deepEqual(ENGINE_SITE_POLICIES.map((p) => p.value), ['respect', 'ignore', 'skip-compatible']);
  assert.deepEqual(ENGINE_SITE_POLICIES.map((p) => p.id), [
    'eng-policy-respect', 'eng-policy-ignore', 'eng-policy-skip-compatible',
  ]);
  const stringValues = Object.values(STRINGS);
  for (const p of ENGINE_SITE_POLICIES) {
    assert.ok(stringValues.includes(p.label), `policy label must be a STRINGS entry: ${p.label}`);
  }
  assert.equal(STRINGS.sectionEngineLabel !== undefined && STRINGS.enginePolicyNote !== undefined, true);
});

test('options main.js wires the skeleton from the shared module', () => {
  assert.ok(mainSrc.includes("section('sec-engine'"), 'section IV must be rendered by main.js');
  assert.ok(mainSrc.includes('seatCheckboxState('), 'seat state must come from the shared helper');
  assert.ok(mainSrc.includes('ENGINE_GROUPS'), 'group hosts must come from the shared data');
  assert.ok(mainSrc.includes('ENGINE_SITE_POLICIES'), 'policy radios must come from the shared data');
  assert.ok(mainSrc.includes("'eng-seat'"), 'seat checkbox id');
  assert.ok(mainSrc.includes("'eng-controls'"), 'controls container id');
  assert.ok(/disabled:\s*!seatCheckboxState\(current\.themeId\)/.test(mainSrc),
    'controls container starts disabled unless the seat is checked');
  assert.ok(/\.disabled = !seatCheckboxState\(s\.themeId\)/.test(mainSrc),
    'sync re-derives the disabled state from the settings subscription');
});

test('seat and section-I radios interoperate through the themeId namespace', () => {
  // Checking the seat saves the seat; unchecking falls back to the first
  // classic theme (some theme must stay selected — original dark_41 semantics).
  assert.ok(/save\(\{ themeId: e\.target\.checked \? SEAT_THEME_ID : PALETTES\[0\]\.id \}\)/.test(mainSrc));
  // Every themeId radio is re-derived on each settings change, so a stale
  // palette check clears when the seat takes the namespace (and vice versa).
  assert.ok(/querySelectorAll\('#sec-themes input\[name="themeId"\]'\)/.test(mainSrc));
  assert.ok(/i\.checked = i\.value === s\.themeId/.test(mainSrc));
  // Policy radios re-render from the settings subscription like the rest of the page.
  assert.ok(/save\(\{ engine: \{ \.\.\.current\.engine, siteThemePolicy: e\.target\.value \} \}\)/.test(mainSrc));
  assert.ok(/querySelectorAll\('#sec-engine input\[name="siteThemePolicy"\]'\)/.test(mainSrc));
});

// ---- Task 5: §8 sub-option controls (table contract, autosave, exclusivity) ----

// §8's rendered key list — every engine.* key the mapping table lists except
// siteThemePolicy (Task 4's tri-state) and variables/extraRules (Task 6).
const SECTION8_KEYS = [
  'darken.text', 'darken.svgFill', 'darken.svgStroke', 'darken.border',
  'darken.background', 'darken.boxShadow', 'darken.textShadow',
  'borderNeedsWidth', 'backgroundBlend', 'preserveBackgroundProps', 'ignoreInitialProps',
  'fallback.enabled', 'fallback.transparency',
  'darkenBackgroundImages', 'removeGradients', 'removeGradientColors',
  'darkenGradients', 'darkenGradientVariables', 'gradientShade',
  'highPriority', 'processMediaQueries', 'processKeyframes', 'processSupports',
  'contextAware',
  'contextAwareTargets.text', 'contextAwareTargets.border',
  'contextAwareTargets.background', 'contextAwareTargets.svg',
  'alphaRange.min', 'alphaRange.max', 'luminanceRange.min', 'luminanceRange.max',
  'preserveAlpha', 'preserveDarkColors',
  'nearWhiteAdjust.enabled', 'nearWhiteAdjust.min', 'nearWhiteAdjust.max', 'nearWhiteAdjust.percent',
  'processInlineStyles', 'processShadowStyles', 'mapCssVariables', 'watchClassChanges', 'watchNewElements',
  'performanceObserver', 'tuning', 'deepRules',
  'recheck', 'recheckDelay',
];

// The non-checkbox types; every other §8 key is a boolean → checkbox.
const SECTION8_TYPES = {
  gradientShade: 'text',
  tuning: 'radio',
  'fallback.transparency': 'number',
  'alphaRange.min': 'number', 'alphaRange.max': 'number',
  'luminanceRange.min': 'number', 'luminanceRange.max': 'number',
  'nearWhiteAdjust.min': 'number', 'nearWhiteAdjust.max': 'number', 'nearWhiteAdjust.percent': 'number',
  recheckDelay: 'number',
};

test('ENGINE_CONTROLS covers the §8 rendered keys exactly, with §8 types', () => {
  const paths = [...new Set(ENGINE_CONTROLS.map((c) => c.path))].sort();
  assert.deepEqual(paths, [...SECTION8_KEYS].sort());
  for (const c of ENGINE_CONTROLS) {
    assert.equal(c.type, SECTION8_TYPES[c.path] ?? 'checkbox', `control type for ${c.path}`);
    assert.match(c.id, /^eng-[a-z0-9-]+$/, `id shape for ${c.path}`);
    assert.ok(Object.values(STRINGS).includes(c.label), `label must be a STRINGS entry: ${c.path}`);
  }
  assert.deepEqual(ENGINE_CONTROL_IDS, ENGINE_CONTROLS.map((c) => c.id));
  assert.equal(new Set(ENGINE_CONTROL_IDS).size, ENGINE_CONTROL_IDS.length, 'ids are unique');
});

test('number controls carry the §8 ranges', () => {
  const byPath = Object.fromEntries(
    ENGINE_CONTROLS.filter((c) => c.type === 'number').map((c) => [c.path, c]),
  );
  assert.equal(Object.keys(byPath).length, 9);
  for (const [path, c] of Object.entries(byPath)) {
    assert.equal(c.min, 0, `${path} min`);
    assert.ok(c.max === 100 || c.max === 10000, `${path} max`);
  }
  assert.equal(byPath['recheckDelay'].max, 10000);
  assert.equal(byPath['recheckDelay'].step, 10);
  for (const path of ['fallback.transparency', 'alphaRange.min', 'luminanceRange.max', 'nearWhiteAdjust.percent']) {
    assert.equal(byPath[path].max, 100, `${path} is a 0-100 percent`);
  }
});

test('tuning radios: one pair named tuning — performance / page-load', () => {
  const radios = ENGINE_CONTROLS.filter((c) => c.type === 'radio');
  assert.deepEqual(radios.map((c) => c.id), ['eng-tuning-performance', 'eng-tuning-page-load']);
  assert.deepEqual(radios.map((c) => c.value), ['performance', 'page-load']);
  for (const r of radios) assert.equal(r.name, 'tuning');
});

test('controls render into the §8 group hosts', () => {
  const hostOf = (path) => {
    if (/^(darken\.|borderNeedsWidth|backgroundBlend|preserveBackgroundProps|ignoreInitialProps|fallback\.)/.test(path)) return 'eng-group-a';
    if (/^(darkenBackgroundImages|removeGradients|removeGradientColors|darkenGradients|darkenGradientVariables|gradientShade)$/.test(path)) return 'eng-group-b';
    if (/^(highPriority|processMediaQueries|processKeyframes|processSupports|contextAware|alphaRange|luminanceRange|preserveAlpha|preserveDarkColors|nearWhiteAdjust)/.test(path)) return 'eng-group-cde';
    if (/^(processInlineStyles|processShadowStyles|mapCssVariables|watchClassChanges|watchNewElements)$/.test(path)) return 'eng-group-fghi';
    if (/^(performanceObserver|tuning|deepRules)$/.test(path)) return 'eng-group-mn';
    if (/^(recheck|recheckDelay)$/.test(path)) return ENGINE_BEHAVIOR_HOST;
    return null;
  };
  const hosts = new Set([...ENGINE_GROUPS.map((g) => g.id), ENGINE_BEHAVIOR_HOST]);
  for (const c of ENGINE_CONTROLS) {
    const expected = hostOf(c.path);
    assert.ok(expected, `§8 grouping must cover ${c.path}`);
    assert.equal(c.host, expected, `host for ${c.path}`);
    assert.ok(hosts.has(c.host));
  }
});

test('tuningFallback truth table — page-load needs LongTaskTiming support', () => {
  assert.equal(tuningFallback(false, 'page-load'), 'performance');
  assert.equal(tuningFallback(true, 'page-load'), 'page-load');
  assert.equal(tuningFallback(true, 'performance'), 'performance');
  assert.equal(tuningFallback(false, 'performance'), 'performance');
});

test('assembleEnginePatch applies one change into a full engine group copy', () => {
  const base = engineDefaults();
  // top-level key: applied, siblings intact
  let next = assembleEnginePatch(base, 'deepRules', true);
  assert.equal(next.deepRules, true);
  assert.equal(next.siteThemePolicy, base.siteThemePolicy);
  assert.equal(next.gradientShade, base.gradientShade);
  // nested subgroup: leaf applied, siblings preserved, fresh objects
  next = assembleEnginePatch(base, 'darken.text', false);
  assert.equal(next.darken.text, false);
  assert.equal(next.darken.svgFill, true);
  assert.notEqual(next.darken, base.darken);
  next = assembleEnginePatch(base, 'fallback.transparency', 25);
  assert.equal(next.fallback.transparency, 25);
  assert.equal(next.fallback.enabled, true);
  next = assembleEnginePatch(base, 'luminanceRange.max', 80);
  assert.equal(next.luminanceRange.max, 80);
  assert.equal(next.luminanceRange.min, 10);
  next = assembleEnginePatch(base, 'nearWhiteAdjust.percent', 30);
  assert.equal(next.nearWhiteAdjust.percent, 30);
  assert.equal(next.nearWhiteAdjust.enabled, true);
  next = assembleEnginePatch(base, 'contextAwareTargets.background', false);
  assert.equal(next.contextAwareTargets.background, false);
  assert.equal(next.contextAwareTargets.svg, false);
  next = assembleEnginePatch(base, 'gradientShade', 'linear-gradient(#000, #111)');
  assert.equal(next.gradientShade, 'linear-gradient(#000, #111)');
  // the snapshot stays untouched
  assert.equal(base.darken.text, true);
  // a missing snapshot still yields a usable group
  assert.deepEqual(assembleEnginePatch(undefined, 'recheck', true), { recheck: true });
});

test('controlValue converts raw input values per control type', () => {
  const pct = { type: 'number', min: 0, max: 100 };
  assert.equal(controlValue(pct, '25'), 25, 'numbers coerce with Number()');
  assert.equal(controlValue(pct, '150'), 100, 'clamped to max');
  assert.equal(controlValue(pct, '-5'), 0, 'clamped to min');
  assert.equal(controlValue(pct, 'abc'), 0, 'NaN counts as 0');
  assert.equal(controlValue({ type: 'number', min: 0, max: 10000, step: 10 }, '5000'), 5000);
  assert.equal(controlValue({ type: 'checkbox' }, true), true);
  assert.equal(controlValue({ type: 'checkbox' }, false), false);
  assert.equal(controlValue({ type: 'text' }, 'hsla(0,0%,0%,.85)'), 'hsla(0,0%,0%,.85)');
  assert.equal(controlValue({ type: 'radio' }, 'page-load'), 'page-load');
});

test('engineValueAt reads nested control values', () => {
  const engine = engineDefaults();
  assert.equal(engineValueAt(engine, 'darken.text'), true);
  assert.equal(engineValueAt(engine, 'luminanceRange.max'), 75);
  assert.equal(engineValueAt(engine, 'tuning'), 'performance');
  assert.equal(engineValueAt(engine, 'nope.nope'), undefined);
});

test('options main.js renders §8 controls from the shared table', () => {
  assert.ok(mainSrc.includes('ENGINE_CONTROLS'), 'controls must come from the shared table');
  assert.ok(mainSrc.includes('ENGINE_BEHAVIOR_HOST'), 'the section-II host id comes from the shared module');
  assert.ok(/for \(const c of ENGINE_CONTROLS\.filter/.test(mainSrc),
    'group hosts and the behavior box fill from the table');
  assert.ok(/function engineControl\(/.test(mainSrc), 'one generic row renderer');
  const hardcoded = [...mainSrc.matchAll(/id:\s*'(eng-[a-z0-9-]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(hardcoded, ['eng-controls', 'eng-seat'],
    'control ids must come from ENGINE_CONTROLS, never literals');
});

test('options main.js autosaves each control as a whole-engine patch', () => {
  assert.ok(/ENGINE_CONTROLS\.find\(\(k\) => k\.id === e\.target\.id\)/.test(mainSrc),
    'delegation resolves the changed control by id');
  assert.ok(/assembleEnginePatch\(current\.engine, c\.path, controlValue\(c, raw\)\)/.test(mainSrc));
  assert.ok(/current = \{ \.\.\.current, engine: next \}/.test(mainSrc),
    'the snapshot advances synchronously so rapid edits compose instead of clobbering');
  assert.ok(/btn\.addEventListener\('click', \(\) => save\(\{ \.\.\.DEFAULT_SETTINGS \}\)\)/.test(mainSrc),
    'Reset writes defaults; the sync loop re-checks every §8 control');
});

test('tuning exclusivity: LongTaskTiming gate, alert copy, no-save revert', () => {
  assert.ok(/tuningFallback\(typeof window\.PerformanceLongTaskTiming !== 'undefined', chosen\)/.test(mainSrc));
  assert.ok(/window\.alert\(STRINGS\.engineTuningUnsupported\)/.test(mainSrc),
    'the alert copy comes from strings.js');
  assert.ok(/'#eng-tuning-performance'/.test(mainSrc), 'the revert re-checks the performance radio');
  assert.ok(/function acceptTuning\(/.test(mainSrc));
});

test('sync re-derives every §8 control from settings and gates the seat', () => {
  assert.ok(/for \(const c of ENGINE_CONTROLS\) \{/.test(mainSrc), 'sync loops over the shared table');
  assert.ok(/engineValueAt\(s\.engine, c\.path\)/.test(mainSrc));
  assert.ok(/node\.checked = node\.value === v/.test(mainSrc), 'radio state follows engine.tuning');
  assert.ok(/node\.disabled = !seatCheckboxState\(s\.themeId\)/.test(mainSrc),
    'the section-II engine keys disable with the seat (#eng-controls covers the rest)');
});
