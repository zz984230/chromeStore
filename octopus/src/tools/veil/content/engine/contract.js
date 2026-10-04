// src/content/engine/contract.js
// The color rewriting contract (M2-BEHAVIOR §3) as a pure function: every
// declaration the engine touches funnels through rewriteColor. Branch order
// is normative — tests pin each branch.
import { parseColor, toHex8, luminanceOf, darken, lighten, hslOf } from '../../shared/colorMath.js';
import { ENGINE_VARIABLES } from '../../shared/engineTheme.js';

export function engineDefaults() {
  return {
    siteThemePolicy: 'skip-compatible', // 'respect' | 'ignore' | 'skip-compatible' (j/k/l)
    darken: { text: true, svgFill: true, svgStroke: true, border: true, background: true, boxShadow: true, textShadow: true },
    borderNeedsWidth: false,
    backgroundBlend: true,
    preserveBackgroundProps: true,
    ignoreInitialProps: true,
    fallback: { enabled: true, transparency: 10 },
    darkenBackgroundImages: true,
    removeGradients: true,
    removeGradientColors: false,
    darkenGradients: true,
    darkenGradientVariables: false,
    gradientShade: 'linear-gradient(hsla(0, 0%, 0%, 0.85), hsla(0, 0%, 0%, 0.75))',
    highPriority: false,
    processMediaQueries: false,
    processKeyframes: false,
    processSupports: false,
    contextAware: true,
    contextAwareTargets: { text: false, border: false, background: true, svg: false },
    alphaRange: { min: 10, max: 90 },
    luminanceRange: { min: 10, max: 75 },
    preserveAlpha: true,
    preserveDarkColors: true,
    nearWhiteAdjust: { enabled: true, min: 5, max: 95, percent: 10 },
    processInlineStyles: false,   // M2b
    processShadowStyles: false,   // M2b
    mapCssVariables: true,
    watchClassChanges: false,     // M2b
    watchNewElements: false,      // M2b
    performanceObserver: false,   // M2b
    tuning: 'performance',        // 'performance' | 'page-load' (M2b)
    deepRules: false,
    recheck: true,                // effect lands in M2b; schema now per §8
    recheckDelay: 0,
    variables: { ...ENGINE_VARIABLES },
    extraRules: null,             // null → EXTRA_RULES_DEFAULT at render time
  };
}

const VAR_TOKEN = /(var\(--[a-zA-Z0-9-_]+\))/g;

function resolveVars(value, varMap) {
  let out = value.replace(VAR_TOKEN, (m) => (varMap[m] !== undefined ? varMap[m] : m));
  // follow chains up to 5 hops for bare var names left in the map
  for (let i = 0; i < 5 && out.indexOf('--') !== -1; i++) {
    const next = varMap[out];
    if (next === undefined) break;
    out = next;
  }
  return out;
}

function selectorTargetsRoot(selectorText) {
  if (!selectorText) return false;
  return selectorText.split(',').map((s) => s.trim())
    .some((s) => (s === 'html' || s === 'body') && s.indexOf('.') === -1);
}

export function rewriteColor(value, { type, engine, varMap = {}, selectorText = '' }) {
  const fallback = {
    text: 'var(--nv-text)', svg: 'var(--nv-ink)',
    background: 'var(--nv-surface)', border: 'var(--nv-edge)',
  }[type];

  const targetOn = type === 'svg'
    ? engine.contextAwareTargets.svg
    : engine.contextAwareTargets[type === 'text' ? 'text' : type === 'border' ? 'border' : 'background'];
  if (!engine.contextAware || !targetOn) return fallback;

  let color = String(value);
  if (engine.mapCssVariables && color.indexOf('--') !== -1) color = resolveVars(color, varMap);

  if (color.indexOf('-gradient(') !== -1) {
    if (engine.removeGradientColors) return fallback;
    if (engine.darkenGradients) return `${engine.gradientShade}, ${color}`;
    return fallback;
  }

  if (color === 'transparent') return 'var(--nv-transparent)';

  const specs = parseColor(color);
  if (!specs) {
    if (engine.fallback.enabled) {
      const t = engine.fallback.transparency;
      return `color-mix(in srgb, ${fallback} ${100 - t}%, transparent)`;
    }
    return fallback;
  }

  const aMin = engine.alphaRange.min / 100;
  const tMin = engine.luminanceRange.min / 100;
  const tMax = engine.luminanceRange.max / 100;

  if (specs.a < aMin) return color;

  const { h, s, l } = hslOf(specs);
  const lum = luminanceOf(specs);
  const isbright = Number.isFinite(s + l + specs.a)
    && (l > tMax || (s + l) / 2 > tMax)
    && (specs.a > tMax || s < aMin && l > engine.alphaRange.max / 100);
  const rootSpecial = selectorTargetsRoot(selectorText);

  if (lum > tMax || rootSpecial) {
    if (engine.preserveAlpha) {
      if (specs.a < 1) {
        return `color-mix(in srgb, ${fallback}, transparent ${Math.floor((1 - specs.a) * 100)}%)`;
      }
      // near-white blend is only reachable with alpha preservation on and a
      // fully opaque color — nesting mirrors the original (M2-BEHAVIOR §3-5)
      if (engine.nearWhiteAdjust.enabled) {
        const strength = 105, exponent = 1.10;
        let bp = Math.floor(Math.min(100, Math.pow(
          Math.max(0, Math.min(1, (l - tMax) / (1 - tMax))), exponent) * strength));
        if (isbright === false) bp = 0;
        const nw = engine.nearWhiteAdjust;
        if (bp >= nw.min && bp <= nw.max) {
          const hex = engine.variables['--nv-surface'];
          if (/^#[0-9a-f]{6}$/i.test(hex)) {
            let dp = Math.floor(nw.percent * (bp / 100));
            const dr = Math.max(0, parseInt(hex.slice(1, 3), 16) - dp);
            const dg = Math.max(0, parseInt(hex.slice(3, 5), 16) - dp);
            const db = Math.max(0, parseInt(hex.slice(5, 7), 16) - dp);
            const darker = `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
            return `color-mix(in srgb, ${fallback} ${100 - bp}%, ${darker} ${bp}%)`;
          }
        }
      }
    }
    return fallback;
  }

  if (lum > tMin) {
    const method = type === 'text' || type === 'svg' ? 'lighten' : 'darken';
    let percent = 0.10;
    if (isbright && method === 'darken') percent = 0.50;
    const shifted = method === 'lighten' ? lighten(specs, percent) : darken(specs, percent);
    return toHex8(shifted);
  }

  // lum <= tMin — dark colors
  if (lum === 0) return color;
  if (isbright) {
    return engine.preserveAlpha && specs.a < 1
      ? `color-mix(in srgb, ${fallback}, transparent ${Math.floor((1 - specs.a) * 100)}%)`
      : fallback;
  }
  if (engine.preserveDarkColors) return color;
  return fallback;
}

export function isProcessableColor(value, type, engine) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const v = value.toLowerCase();
  if (v.indexOf('--') !== -1) return true;
  if (v.indexOf('-gradient(') !== -1) {
    return engine.removeGradientColors || engine.darkenGradients;
  }
  const common = ['unset', 'inherit', 'window', 'windowtext', 'currentcolor'];
  if (type === 'text') {
    return !common.concat('inherit').some((k) => v.includes(k));
  }
  if (type === 'svg' || type === 'border') {
    return !['none', 'transparent', ...common, ...(type === 'border' ? ['initial'] : [])].includes(v.trim());
  }
  if (type === 'background') {
    if (['none', 'black', 'inherit', 'initial', ...common].includes(v.trim())) return false;
    if (v.includes('url(')) return false;
    return true;
  }
  return false;
}

// 注意：`isProcessableColor('text')` 分支排除 `inherit/window/windowtext/currentcolor` 但**允许** `transparent`（transparent 走 `font-size: 0` 特例，Task 7 处理）。
