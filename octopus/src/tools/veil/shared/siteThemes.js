// src/shared/siteThemes.js
// Selector-level dark refinements for 10 high-traffic sites (ADR-0003:
// selectors authored fresh). Layered ON TOP of the classic theme: the content
// script sets <html data-nv-site="<id>"> and injects this sheet after
// nv-classic. The html[data-nv-site] prefix + :is(#nv-sheet, *) booster keeps
// every rule above the classic overlay's ID-level specificity (D1). Selectors
// are v1 drafts — tuned during the acceptance round.
import { normalizeHostname } from './scope.js';

// Split a selector on top-level commas only — `:is(#nv-sheet, *)` and
// attribute selectors contain commas that are not selector separators.
export function splitTopLevel(selector) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

const sheet = (id, rules) => rules
  .map(([sel, body]) => `${splitTopLevel(sel).map((s) => `html[data-nv-site="${id}"] :is(#nv-sheet, *)${s}`).join(', ')} { ${body} }`)
  .join('\n');

export const SITE_THEMES = [
  {
    id: 'google', label: 'Google', hosts: ['google.com'], compatible: true,
    css: sheet('google', [
      [' header', 'background-color: #202124 !important;'],
      [' footer', 'background-color: #171717 !important;'],
      [' input', 'background-color: #303134 !important; color: #e8eaed !important;'],
      [' a:visited', 'color: #c58af9 !important;'],
    ]),
  },
  {
    id: 'github', label: 'GitHub', hosts: ['github.com'],
    css: sheet('github', [
      [' .AppHeader, .Header, header', 'background-color: #010409 !important; border-color: #30363d !important;'],
      [' .Box, .timeline-comment', 'background-color: #0d1117 !important; border-color: #30363d !important;'],
      [' .btn', 'background-color: #212830 !important; border-color: #3d444d !important;'],
      [' table td, table th', 'border-color: #21262d !important;'],
      [' .blob-code, .file', 'background-color: #0d1117 !important;'],
    ]),
  },
  {
    id: 'wikipedia', label: 'Wikipedia', hosts: ['wikipedia.org'],
    css: sheet('wikipedia', [
      [' .infobox, .ambox, .thumb, .navbox, .side-box', 'background-color: #202122 !important; border-color: #383b40 !important;'],
      [' table.wikitable', 'background-color: #101418 !important; border-color: #383b40 !important;'],
      [' #mw-navigation, #mw-header', 'background-color: #101418 !important;'],
      [' .mw-parser-output .hatnote', 'color: #a2a9b1 !important;'],
    ]),
  },
  {
    id: 'stackoverflow', label: 'Stack Overflow', hosts: ['stackoverflow.com'],
    css: sheet('stackoverflow', [
      [' .s-topbar, .top-bar', 'background-color: #2d2d2d !important;'],
      [' .s-post-summary, .question, .answer', 'background-color: #1c1b1b !important;'],
      [' pre, code, .s-code-block', 'background-color: #1d1d1d !important;'],
    ]),
  },
  {
    id: 'reddit', label: 'Reddit', hosts: ['reddit.com'],
    css: sheet('reddit', [
      [' shreddit-header, header', 'background-color: #1a1a1b !important;'],
      [' [data-testid="post-container"]', 'background-color: #1a1a1b !important; border-color: #343536 !important;'],
    ]),
  },
  {
    id: 'amazon', label: 'Amazon', hosts: ['amazon.com'],
    css: sheet('amazon', [
      [' #navbar, #nav-main', 'background-color: #131920 !important;'],
      [' #nav-search .nav-search-field input, #twotabsearchtextbox', 'background-color: #243139 !important; color: #e7e9ec !important;'],
      [' .s-card, .s-result-item', 'background-color: #1a1f25 !important;'],
    ]),
  },
  {
    id: 'facebook', label: 'Facebook', hosts: ['facebook.com'],
    css: sheet('facebook', [
      [' [role="banner"]', 'background-color: #242526 !important;'],
      [' [role="navigation"]', 'background-color: #242526 !important;'],
      [' [role="article"]', 'background-color: #1c1e21 !important; border-color: #3a3b3c !important;'],
    ]),
  },
  {
    id: 'instagram', label: 'Instagram', hosts: ['instagram.com'],
    css: sheet('instagram', [
      [' header, nav', 'background-color: #000000 !important;'],
      [' [role="navigation"]', 'background-color: #000000 !important;'],
      [' article', 'border-color: #262626 !important;'],
    ]),
  },
  {
    id: 'twitter', label: 'X (Twitter)', hosts: ['twitter.com', 'x.com'],
    css: sheet('twitter', [
      [' [data-testid="app-tab-bar"]', 'background-color: #16181c !important; border-color: #2f3336 !important;'],
      [' header', 'background-color: #000000 !important; border-color: #2f3336 !important;'],
      [' [data-testid="cellInnerDiv"]', 'background-color: #000000 !important; border-color: #2f3336 !important;'],
    ]),
  },
  {
    id: 'bing', label: 'Bing', hosts: ['bing.com'],
    css: sheet('bing', [
      [' #b_header', 'background-color: #333333 !important;'],
      [' #b_results > li', 'background-color: #222222 !important;'],
      [' #b_results .b_caption p', 'color: #9aa0a6 !important;'],
    ]),
  },
];

export function findSiteTheme(id) {
  return SITE_THEMES.find((t) => t.id === id);
}

export function matchSiteTheme(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return null;
  return SITE_THEMES.find((t) => t.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

export function compileSiteTheme(id) {
  return findSiteTheme(id)?.css.trim();
}
