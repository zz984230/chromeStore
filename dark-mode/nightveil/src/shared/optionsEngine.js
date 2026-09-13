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

// The section-II Behavior box hosts the recheck pair — engine.* keys whose
// §8 rows are marked II-area (nativerecheck / nativerechecktimeout).
export const ENGINE_BEHAVIOR_HOST = 'sec-options-behavior';

// The §8 sub-option control table (M2-BEHAVIOR §8 — siteThemePolicy lives in
// ENGINE_SITE_POLICIES, variables/extraRules arrive with task 6). src/options/
// main.js renders every row from this table, so control ids, types and ranges
// cannot drift from the acceptance queries that pin them. One row per control;
// tuning is a radio pair sharing path 'tuning'.
export const ENGINE_CONTROLS = Object.freeze([
  // a — color rules
  { host: 'eng-group-a', id: 'eng-darken-text', path: 'darken.text', type: 'checkbox', label: STRINGS.engineDarkenTextLabel },
  { host: 'eng-group-a', id: 'eng-darken-svgfill', path: 'darken.svgFill', type: 'checkbox', label: STRINGS.engineDarkenSvgFillLabel },
  { host: 'eng-group-a', id: 'eng-darken-svgstroke', path: 'darken.svgStroke', type: 'checkbox', label: STRINGS.engineDarkenSvgStrokeLabel },
  { host: 'eng-group-a', id: 'eng-darken-border', path: 'darken.border', type: 'checkbox', label: STRINGS.engineDarkenBorderLabel },
  { host: 'eng-group-a', id: 'eng-darken-background', path: 'darken.background', type: 'checkbox', label: STRINGS.engineDarkenBackgroundLabel },
  { host: 'eng-group-a', id: 'eng-darken-boxshadow', path: 'darken.boxShadow', type: 'checkbox', label: STRINGS.engineDarkenBoxShadowLabel },
  { host: 'eng-group-a', id: 'eng-darken-textshadow', path: 'darken.textShadow', type: 'checkbox', label: STRINGS.engineDarkenTextShadowLabel },
  { host: 'eng-group-a', id: 'eng-borderneedswidth', path: 'borderNeedsWidth', type: 'checkbox', label: STRINGS.engineBorderNeedsWidthLabel },
  { host: 'eng-group-a', id: 'eng-backgroundblend', path: 'backgroundBlend', type: 'checkbox', label: STRINGS.engineBackgroundBlendLabel },
  { host: 'eng-group-a', id: 'eng-preservebackgroundprops', path: 'preserveBackgroundProps', type: 'checkbox', label: STRINGS.enginePreserveBackgroundPropsLabel },
  { host: 'eng-group-a', id: 'eng-ignoreinitialprops', path: 'ignoreInitialProps', type: 'checkbox', label: STRINGS.engineIgnoreInitialPropsLabel },
  { host: 'eng-group-a', id: 'eng-fallback-enabled', path: 'fallback.enabled', type: 'checkbox', label: STRINGS.engineFallbackEnabledLabel },
  { host: 'eng-group-a', id: 'eng-fallback-transparency', path: 'fallback.transparency', type: 'number', min: 0, max: 100, label: STRINGS.engineFallbackTransparencyLabel },
  // b — background images and gradients
  { host: 'eng-group-b', id: 'eng-darkenbackgroundimages', path: 'darkenBackgroundImages', type: 'checkbox', label: STRINGS.engineDarkenBackgroundImagesLabel },
  { host: 'eng-group-b', id: 'eng-removegradients', path: 'removeGradients', type: 'checkbox', label: STRINGS.engineRemoveGradientsLabel },
  { host: 'eng-group-b', id: 'eng-removegradientcolors', path: 'removeGradientColors', type: 'checkbox', label: STRINGS.engineRemoveGradientColorsLabel },
  { host: 'eng-group-b', id: 'eng-darkengradients', path: 'darkenGradients', type: 'checkbox', label: STRINGS.engineDarkenGradientsLabel },
  { host: 'eng-group-b', id: 'eng-darkengradientvariables', path: 'darkenGradientVariables', type: 'checkbox', label: STRINGS.engineDarkenGradientVariablesLabel },
  { host: 'eng-group-b', id: 'eng-gradientshade', path: 'gradientShade', type: 'text', label: STRINGS.engineGradientShadeLabel },
  // cde — priority, at-rules, context-aware colors
  { host: 'eng-group-cde', id: 'eng-highpriority', path: 'highPriority', type: 'checkbox', label: STRINGS.engineHighPriorityLabel },
  { host: 'eng-group-cde', id: 'eng-processmediaqueries', path: 'processMediaQueries', type: 'checkbox', label: STRINGS.engineProcessMediaQueriesLabel },
  { host: 'eng-group-cde', id: 'eng-processkeyframes', path: 'processKeyframes', type: 'checkbox', label: STRINGS.engineProcessKeyframesLabel },
  { host: 'eng-group-cde', id: 'eng-processsupports', path: 'processSupports', type: 'checkbox', label: STRINGS.engineProcessSupportsLabel },
  { host: 'eng-group-cde', id: 'eng-contextaware', path: 'contextAware', type: 'checkbox', label: STRINGS.engineContextAwareLabel },
  { host: 'eng-group-cde', id: 'eng-contextawaretargets-text', path: 'contextAwareTargets.text', type: 'checkbox', label: STRINGS.engineContextAwareTargetsTextLabel },
  { host: 'eng-group-cde', id: 'eng-contextawaretargets-border', path: 'contextAwareTargets.border', type: 'checkbox', label: STRINGS.engineContextAwareTargetsBorderLabel },
  { host: 'eng-group-cde', id: 'eng-contextawaretargets-background', path: 'contextAwareTargets.background', type: 'checkbox', label: STRINGS.engineContextAwareTargetsBackgroundLabel },
  { host: 'eng-group-cde', id: 'eng-contextawaretargets-svg', path: 'contextAwareTargets.svg', type: 'checkbox', label: STRINGS.engineContextAwareTargetsSvgLabel },
  { host: 'eng-group-cde', id: 'eng-alpharange-min', path: 'alphaRange.min', type: 'number', min: 0, max: 100, label: STRINGS.engineAlphaRangeMinLabel },
  { host: 'eng-group-cde', id: 'eng-alpharange-max', path: 'alphaRange.max', type: 'number', min: 0, max: 100, label: STRINGS.engineAlphaRangeMaxLabel },
  { host: 'eng-group-cde', id: 'eng-luminancerange-min', path: 'luminanceRange.min', type: 'number', min: 0, max: 100, label: STRINGS.engineLuminanceRangeMinLabel },
  { host: 'eng-group-cde', id: 'eng-luminancerange-max', path: 'luminanceRange.max', type: 'number', min: 0, max: 100, label: STRINGS.engineLuminanceRangeMaxLabel },
  { host: 'eng-group-cde', id: 'eng-preservealpha', path: 'preserveAlpha', type: 'checkbox', label: STRINGS.enginePreserveAlphaLabel },
  { host: 'eng-group-cde', id: 'eng-preservedarkcolors', path: 'preserveDarkColors', type: 'checkbox', label: STRINGS.enginePreserveDarkColorsLabel },
  { host: 'eng-group-cde', id: 'eng-nearwhiteadjust-enabled', path: 'nearWhiteAdjust.enabled', type: 'checkbox', label: STRINGS.engineNearWhiteAdjustEnabledLabel },
  { host: 'eng-group-cde', id: 'eng-nearwhiteadjust-min', path: 'nearWhiteAdjust.min', type: 'number', min: 0, max: 100, label: STRINGS.engineNearWhiteAdjustMinLabel },
  { host: 'eng-group-cde', id: 'eng-nearwhiteadjust-max', path: 'nearWhiteAdjust.max', type: 'number', min: 0, max: 100, label: STRINGS.engineNearWhiteAdjustMaxLabel },
  { host: 'eng-group-cde', id: 'eng-nearwhiteadjust-percent', path: 'nearWhiteAdjust.percent', type: 'number', min: 0, max: 100, label: STRINGS.engineNearWhiteAdjustPercentLabel },
  // fghi — inline styles, stylesheets, change tracking
  { host: 'eng-group-fghi', id: 'eng-processinlinestyles', path: 'processInlineStyles', type: 'checkbox', label: STRINGS.engineProcessInlineStylesLabel },
  { host: 'eng-group-fghi', id: 'eng-processshadowstyles', path: 'processShadowStyles', type: 'checkbox', label: STRINGS.engineProcessShadowStylesLabel },
  { host: 'eng-group-fghi', id: 'eng-mapcssvariables', path: 'mapCssVariables', type: 'checkbox', label: STRINGS.engineMapCssVariablesLabel },
  { host: 'eng-group-fghi', id: 'eng-watchclasschanges', path: 'watchClassChanges', type: 'checkbox', label: STRINGS.engineWatchClassChangesLabel },
  { host: 'eng-group-fghi', id: 'eng-watchnewelements', path: 'watchNewElements', type: 'checkbox', label: STRINGS.engineWatchNewElementsLabel },
  // mn — performance and deep rules
  { host: 'eng-group-mn', id: 'eng-performanceobserver', path: 'performanceObserver', type: 'checkbox', label: STRINGS.enginePerformanceObserverLabel },
  { host: 'eng-group-mn', id: 'eng-tuning-performance', path: 'tuning', type: 'radio', name: 'tuning', value: 'performance', label: STRINGS.engineTuningPerformanceLabel },
  { host: 'eng-group-mn', id: 'eng-tuning-page-load', path: 'tuning', type: 'radio', name: 'tuning', value: 'page-load', label: STRINGS.engineTuningPageLoadLabel },
  { host: 'eng-group-mn', id: 'eng-deeprules', path: 'deepRules', type: 'checkbox', label: STRINGS.engineDeepRulesLabel },
  // II-area pair, rendered in the section-II Behavior box
  { host: ENGINE_BEHAVIOR_HOST, id: 'eng-recheck', path: 'recheck', type: 'checkbox', label: STRINGS.engineRecheckLabel },
  { host: ENGINE_BEHAVIOR_HOST, id: 'eng-recheck-delay', path: 'recheckDelay', type: 'number', min: 0, max: 10000, step: 10, label: STRINGS.engineRecheckDelayLabel },
]);

export const ENGINE_CONTROL_IDS = Object.freeze(ENGINE_CONTROLS.map((c) => c.id));

// m.3 (page-load) tuning needs LongTaskTiming support; without it the choice
// falls back to m.2 (M2-BEHAVIOR §0-④).
export function tuningFallback(supportsLongTask, chosen) {
  return !supportsLongTask && chosen === 'page-load' ? 'performance' : chosen;
}

// Read a §8 control value out of an engine group by dotted key path.
export function engineValueAt(engine, path) {
  return path.split('.').reduce((node, seg) => (node == null ? undefined : node[seg]), engine);
}

function setPath(node, segs, value) {
  const [head, ...rest] = segs;
  if (rest.length === 0) return { ...node, [head]: value };
  return { ...node, [head]: setPath(node?.[head] ?? {}, rest, value) };
}

// Whole-engine patch for one control change: apply `value` at `path` over a
// snapshot of the stored engine group. Returns the full group (siblings
// preserved, nothing mutated), so saveSettings({ engine: … }) stays a safe
// last-writer-wins whole-group write with no read-modify-write race.
export function assembleEnginePatch(engine, path, value) {
  return setPath(engine ?? {}, path.split('.'), value);
}

// Raw input value → stored value, by control type: numbers coerce with
// Number() and clamp to the §8 range; checkboxes are booleans; text and radio
// values pass through as strings.
export function controlValue(control, rawValue) {
  if (control.type === 'number') {
    const n = Number(rawValue);
    return Math.min(control.max, Math.max(control.min, Number.isFinite(n) ? n : 0));
  }
  if (control.type === 'checkbox') return !!rawValue;
  return String(rawValue);
}
