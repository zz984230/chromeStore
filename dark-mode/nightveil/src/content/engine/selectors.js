// src/content/engine/selectors.js
// Selector rewriting (M2-BEHAVIOR §4): each processed rule is re-emitted into
// the engine sheet as `html[data-nv-active] <original selector>`. Segment
// rules mirror the original's transform: pseudo-only segments drop, html and
// :root rewrite in place, tokens matching the live <html> attribute surface
// chain directly when they target html itself.
import { splitTopLevel } from '../../shared/siteThemes.js';

const KEY = 'html[data-nv-active]';
const ROOT_KEY = ':root[data-nv-active]';
const MANAGED = new Set(['id', 'class', 'style', 'data-nv-active', 'data-nv-site', 'data-nv-stage']);

export function htmlPropTokens(doc) {
  const html = doc.documentElement;
  if (!html) return [];
  const tokens = [];
  if (html.id) tokens.push(`#${html.id}`);
  for (const c of html.classList) tokens.push(`.${c}`);
  for (const attr of html.attributes) {
    if (MANAGED.has(attr.name)) continue;
    tokens.push(`[${attr.name}]`);
    if (attr.value) tokens.push(`[${attr.name}="${attr.value}"]`);
  }
  return tokens;
}

export function transformSelector(selectorText, htmlProps, countFn) {
  const out = [];
  for (const raw of splitTopLevel(selectorText)) {
    const text = raw.trim();
    if (!text) continue;
    const first = text.split(' ')[0];

    if (text.startsWith('::')) continue; // pseudo-only segment drops
    if (text === '*') { out.push(`${KEY}, ${KEY} *`); continue; }
    if (text.startsWith('*')) { out.push(`${KEY} ${text}`); continue; }
    if (text.startsWith('html')) { out.push(text.replace('html', KEY)); continue; }
    if (text.startsWith(':root')) { out.push(text.replace(':root', ROOT_KEY)); continue; }
    if (text.startsWith(':host')) {
      const simple = text.indexOf(')') === -1;
      out.push(simple ? text.replace(':host', ':host([data-nv-active])')
        : text.replace(')', '[data-nv-active])'));
      continue;
    }

    const matchesHtml = htmlProps.includes(first);
    const noChildCombinator = text.indexOf('>') === -1;
    if (matchesHtml && countFn(first) === 0) {
      out.push(`${KEY}${noChildCombinator ? '' : ' '}${text}`);
    } else if (matchesHtml && noChildCombinator) {
      out.push(`${KEY}${text}, ${KEY} ${text}`);
    } else if (text.startsWith('[')) {
      out.push(`${KEY}${noChildCombinator ? (matchesHtml ? '' : ' ') : ' '}${text}`);
    } else {
      out.push(`${KEY} ${text}`);
    }
  }
  return out.join(', ');
}
