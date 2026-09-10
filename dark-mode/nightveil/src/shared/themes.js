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
html *, body *:not(svg):not(img):not(video):not(canvas):not(picture) {
  color: ${c.fg} !important;
  border-color: ${c.border} !important;
}
body ::placeholder { color: ${c.muted} !important; opacity: 1 !important; }
a:link, a:link *:not(svg) { color: ${c.link} !important; }
a:visited, a:visited * { color: ${c.visited} !important; }
cite, q, blockquote { color: ${c.cite} !important; }
input, textarea, select {
  background-color: ${c.inputBg} !important;
  color: ${c.fg} !important;
}
button {
  background-color: ${c.surface} !important;
  color: ${c.fg} !important;
}
::selection { background-color: ${c.link} !important; color: ${c.bg} !important; }
img, video, canvas, iframe, embed, object, picture { background-color: transparent !important; }
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
img, video, canvas, iframe, embed, object, picture, svg image {
  filter: ${filter};
}
`.trim();
}
