// src/shared/optionsEngine.js
// Pure glue for the engine section (IV) of the options page. src/options/main.js
// renders on import, so node --test cannot load it — the seat decision and the
// section skeleton data live here where they are unit-testable, and main.js
// only wires the DOM.
import { STRINGS } from './strings.js';

// The engine occupies one seat in the themeId namespace ('adaptive'); every
// palette id means another theme holds the seat. Factory default seat
// (M2-BEHAVIOR §0-①/§11).
export const SEAT_THEME_ID = 'adaptive';

// Seat checkbox checked ⟺ themeId === 'adaptive' — the checkbox and the
// section-I palette radios form one single-select namespace (original dark_41
// mechanism): picking either side clears the other.
export function seatCheckboxState(themeId) {
  return themeId === SEAT_THEME_ID;
}

// Group hosts rendered inside #eng-controls, in order. M2c tasks 5-6 append
// the 38 sub-option controls into these hosts (grouping per M2-BEHAVIOR §8,
// original option groups a-n; j/k/l is the site policy tri-state below).
export const ENGINE_GROUPS = [
  { id: 'eng-group-a', label: STRINGS.engineColorsGroupLabel },
  { id: 'eng-group-b', label: STRINGS.engineBackgroundsGroupLabel },
  { id: 'eng-group-cde', label: STRINGS.engineRulesGroupLabel },
  { id: 'eng-group-fghi', label: STRINGS.engineScopeGroupLabel },
  { id: 'eng-group-jkl', label: STRINGS.engineSitePolicyGroupLabel },
  { id: 'eng-group-mn', label: STRINGS.enginePerformanceGroupLabel },
];

// engine.siteThemePolicy tri-state (M2-BEHAVIOR §1); the 'skip-compatible'
// default lives in engineDefaults().
export const ENGINE_SITE_POLICIES = [
  { id: 'eng-policy-respect', value: 'respect', label: STRINGS.enginePolicyRespectLabel },
  { id: 'eng-policy-ignore', value: 'ignore', label: STRINGS.enginePolicyIgnoreLabel },
  { id: 'eng-policy-skip-compatible', value: 'skip-compatible', label: STRINGS.enginePolicySkipCompatibleLabel },
];
