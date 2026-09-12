// tests/unit/site-themes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE_THEMES, findSiteTheme, matchSiteTheme, compileSiteTheme } from '../../src/shared/siteThemes.js';

test('ten site themes with unique ids, labels, and hosts', () => {
  assert.equal(SITE_THEMES.length, 10);
  assert.equal(new Set(SITE_THEMES.map((t) => t.id)).size, 10);
  for (const t of SITE_THEMES) {
    assert.ok(t.label, `${t.id} needs a label`);
    assert.ok(t.hosts.length > 0, `${t.id} needs hosts`);
  }
});

test('matchSiteTheme suffix-matches hosts; unknown and localhost stay null', () => {
  assert.equal(matchSiteTheme('www.github.com').id, 'github');
  assert.equal(matchSiteTheme('gist.github.com').id, 'github');
  assert.equal(matchSiteTheme('WWW.Google.COM').id, 'google');
  assert.equal(matchSiteTheme('x.com').id, 'twitter');
  assert.equal(matchSiteTheme('notgithub.com'), null);
  assert.equal(matchSiteTheme('localhost'), null);
  assert.equal(matchSiteTheme(''), null);
});

// Split on top-level commas only — the booster's `:is(#nv-sheet, *)` and
// attribute selectors contain commas that are not selector separators.
const splitTopLevel = (selector) => {
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
};

test('compiled sheets boost every selector segment with the specificity prefix', () => {
  for (const t of SITE_THEMES) {
    const css = compileSiteTheme(t.id);
    for (const rule of css.split('\n')) {
      const brace = rule.indexOf('{');
      assert.ok(brace > 0, `${t.id} malformed rule: ${rule}`);
      const selectorPart = rule.slice(0, brace);
      for (const segment of splitTopLevel(selectorPart)) {
        assert.ok(
          segment.trim().startsWith(`html[data-nv-site="${t.id}"]`),
          `${t.id} segment missing booster: ${segment}`,
        );
      }
    }
    assert.match(css, /!important/);
    assert.ok(css.length > 100, `${t.id} sheet too small`);
  }
  assert.equal(findSiteTheme('nope'), undefined);
  assert.equal(compileSiteTheme('nope'), undefined);
});
