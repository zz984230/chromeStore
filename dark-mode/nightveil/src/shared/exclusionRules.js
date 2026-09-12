// src/shared/exclusionRules.js
// Rule engine deciding whether a page signals "already dark / opted out".
// Pure functions only — the content script gathers the DOM/cookie signals and
// calls evaluateRules with them (matching logic stays unit-testable).

export function parseList(text) {
  return String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Perceptual luma 0-255 from an rgb()/rgba() computed-style string.
// Fully transparent colors carry no signal → null.
export function luminanceOf(color) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(String(color ?? ''));
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return Math.round(0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]));
}

// "dark" / "only dark" tokens opt out; "light dark" (both modes supported)
// renders light by default and must NOT opt out (D6).
export function metaSchemeIsDark(content) {
  return String(content ?? '')
    .toLowerCase()
    .split(',')
    .map((t) => t.trim())
    .some((t) => t === 'dark' || t === 'only dark');
}

// signals: { metaSchemeDark, htmlAttrs: string[], htmlClasses: string[],
//            cookieNames: string[], bgLuminance: number|null }
export function evaluateRules(rules, signals = {}) {
  const r = rules ?? {};
  if (r.metaScheme && signals.metaSchemeDark) return true;
  const attrs = parseList(r.htmlAttributes);
  if (attrs.length && (signals.htmlAttrs ?? []).some((a) => attrs.includes(a))) return true;
  const classes = parseList(r.htmlClasses);
  if (classes.length && (signals.htmlClasses ?? []).some((c) => classes.includes(c))) return true;
  const cookies = parseList(r.cookies);
  if (cookies.length && (signals.cookieNames ?? []).some((c) => cookies.includes(c))) return true;
  if (r.darkBackground
      && signals.bgLuminance !== null && signals.bgLuminance !== undefined
      && signals.bgLuminance <= (Number.isFinite(Number(r.brightnessThreshold)) ? Number(r.brightnessThreshold) : 50)) return true;
  return false;
}
