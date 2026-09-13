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
} from '../../src/shared/optionsEngine.js';
import { STRINGS } from '../../src/shared/strings.js';
import { PALETTES } from '../../src/shared/palettes.js';

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
