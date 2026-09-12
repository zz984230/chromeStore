// src/shared/themes.js
// Compiles a palette into injectable CSS. Two families (ADR-0002):
//  - overlay: original selector set overriding text/background/link colors
//  - invert: whole-page filter inversion with a media protection list
import { findPalette } from './palettes.js';

export function compileTheme(palette) {
  if (palette.family === 'overlay') return overlayCss(palette);
  if (palette.family === 'invert') return invertCss(palette);
  throw new Error(`unknown family: ${palette.family}`);
}

export function compileThemeById(id) {
  return compileTheme(findPalette(id));
}

function overlayCss({ colors: c }) {
  return `
html { color-scheme: dark; }
html, body {
  background-color: ${c.bg} !important;
  background-image: none !important;
}
body * {
  background-color: ${c.bg} !important;
}
body *:not([data-nv-stage]):not([data-nv-stage] *) { background-image: none !important; }
body :is([class], [id], *) {
  color: ${c.fg} !important;
  border-color: ${c.border} !important;
}
body :is(a:link, a:link *) { color: ${c.link} !important; }
body :is(a:visited, a:visited *) { color: ${c.visited} !important; }
body :is(cite, q, blockquote):is([class], [id], *) { color: ${c.cite} !important; }
body :is([class], [id], *)::placeholder { color: ${c.muted} !important; opacity: 1 !important; }
body input, body textarea, body select {
  background-color: ${c.inputBg} !important;
  color: ${c.fg} !important;
}
body button {
  background-color: ${c.surface} !important;
  color: ${c.fg} !important;
}
::selection { background-color: ${c.link} !important; color: ${c.bg} !important; }
body img, body video, body canvas, body iframe, body embed, body object, body picture, body svg {
  background-color: transparent !important;
}
body [data-nv-stage], body [data-nv-stage] * { background-color: transparent !important; }
`.trim();
}

function invertCss({ params: p }) {
  const filter = `invert(100%) hue-rotate(180deg) brightness(${p.brightness}%) contrast(${p.contrast}%) grayscale(${p.grayscale}%)`;
  return `
html { color-scheme: dark; }
html {
  background-color: #ffffff !important;
  filter: ${filter};
}
body { background-color: #ffffff !important; }
img, video, canvas, iframe, embed, object, svg image {
  filter: invert(100%) hue-rotate(180deg);
}
`.trim();
}
