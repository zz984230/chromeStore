// src/shared/engineTheme.js
// The engine's tunable surface (M2-BEHAVIOR §9): 18 CSS variables users can
// edit (options UI lands in M2c) plus the default extra rules appended after
// the variable block. Values replicate the original defaults verbatim.

export const ENGINE_VARIABLES = Object.freeze({
  '--nv-surface': '#292929',
  '--nv-text': '#dcdcdc',
  '--nv-link': '#8db2e5',
  '--nv-link-visited': '#c76ed7',
  '--nv-cite': '#92de92',
  '--nv-accent': '#a9a9a9',
  '--nv-edge': '#555555',
  '--nv-ink': '#7d7d7d',
  '--nv-mark': '#003d9b',
  '--nv-figure-opacity': '0.85',
  '--nv-image-brightness': '0.85',
  '--nv-shadow-box': '0 0 0 1px rgb(255 255 255 / 10%)',
  '--nv-shadow-text': 'none',
  '--nv-transparent': 'transparent',
  '--nv-image-veil': 'rgba(0, 0, 0, 0.10)',
  '--nv-image-filter': 'brightness(50%) contrast(200%)',
  '--nv-blend': 'multiply',
  '--nv-scrollbar': 'auto',
});

export function engineVarsCss(variables) {
  const decls = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `:root, ::after, ::before, ::backdrop {\n${decls}\n}`;
}

// Default content of the user-editable extra rules (M2-BEHAVIOR §2-2). This
// is data, not hardcoded engine behavior — M2c exposes it as a textarea.
export const EXTRA_RULES_DEFAULT = `
html[data-nv-active]:root {
  color-scheme: dark !important;
  accent-color: var(--nv-accent);
  scrollbar-color: var(--nv-scrollbar);
}
html[data-nv-active] a:visited,
html[data-nv-active] a:visited > *:not(svg) { color: var(--nv-link-visited) !important; }
html[data-nv-active] a:link,
html[data-nv-active] a:link > *:not(svg),
html[data-nv-active] :link:not(cite) { color: var(--nv-link) !important; }
html[data-nv-active] cite,
html[data-nv-active] cite a:link,
html[data-nv-active] cite a:visited { color: var(--nv-cite) !important; }
html[data-nv-active] mark { background-color: var(--nv-mark) !important; }
html[data-nv-active] figure:empty { opacity: var(--nv-figure-opacity) !important; }
html[data-nv-active] img,
html[data-nv-active] image { filter: brightness(var(--nv-image-brightness)) !important; }
`.trim();
