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
  color: ${c.fg} !important;
  border-color: ${c.border} !important;
  background-color: ${c.bg} !important;
}
body ::placeholder { color: ${c.muted} !important; opacity: 1 !important; }
body a:link, body a:link * { color: ${c.link} !important; }
body a:visited, body a:visited * { color: ${c.visited} !important; }
body cite, body q, body blockquote { color: ${c.cite} !important; }
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
