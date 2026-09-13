// tests/unit/engine-inline.test.mjs
// Pure parts of inline style rewriting (M2b Task 3, §0-⑧): the property
// allowlist, the random class generator, and the rewriteInlineNode core driven
// against a fake node + recording insertFn. DOM assembly (style-attr MO,
// activation wiring) is verified via heavy.html in Task 8.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INLINE_PROPS, randInlineClass, rewriteInlineNode } from '../../src/content/engine/engine.js';
import { engineDefaults } from '../../src/content/engine/contract.js';

// Fake node with the property-iteration shape the implementation uses
// (`for i < style.length; key = style[i]` + getPropertyValue + classList).
function fakeNode({ props, values, has = false }) {
  const node = {};
  node.style = { length: props.length, getPropertyValue: (k) => values[k] ?? '' };
  props.forEach((p, i) => { node.style[i] = p; });
  node.classList = { contains: () => has, add: (c) => { node._added = c; } };
  return node;
}

test('INLINE_PROPS is exactly the §0-⑧ five properties', () => {
  assert.deepEqual(INLINE_PROPS, ['color', 'border-color', 'background', 'background-color', 'background-image']);
});

test('randInlineClass: nv-inline-<digits> format, near-unique over 1000 draws', () => {
  const draws = Array.from({ length: 1000 }, () => randInlineClass());
  for (const c of draws) assert.match(c, /^nv-inline-\d+$/);
  // 1e7 draw space → ~50 expected collisions in 1000 draws; exact uniqueness
  // would flake ~5% of runs, so pin a statistical lower bound instead.
  assert.ok(new Set(draws).size >= 900, `expected mostly-unique draws, got ${new Set(draws).size}`);
});

test('rewriteInlineNode: color emits var(--nv-text) at the html-prefixed class selector; custom props land in varMap', () => {
  // contextAwareTargets.text defaults to false → rewriteColor returns the fallback
  const node = fakeNode({ props: ['color', '--x'], values: { color: '#ffffff', '--x': '#ff0000' } });
  const calls = [];
  const varMap = {};
  rewriteInlineNode(node, engineDefaults(), varMap, (...a) => calls.push(a));
  assert.match(node._added, /^nv-inline-\d+$/);
  assert.deepEqual(calls, [[`html[data-nv-active] .${node._added}`, 'color', 'var(--nv-text)']]);
  assert.deepEqual(varMap, { 'var(--x)': '#ff0000' });
});

test('rewriteInlineNode: second call with contains→true reuses the class and skips processed props', () => {
  const values = { color: '#ffffff', '--x': '#ff0000' };
  const node = fakeNode({ props: ['color', '--x'], values });
  const varMap = {};
  const calls1 = [];
  rewriteInlineNode(node, engineDefaults(), varMap, (...a) => calls1.push(a));
  assert.equal(calls1.length, 1);
  const firstClass = node._added;

  node.classList.contains = () => true; // class now confirmed present on the node
  const calls2 = [];
  rewriteInlineNode(node, engineDefaults(), varMap, (...a) => calls2.push(a));
  assert.equal(node._added, firstClass, 'no second class added');
  assert.deepEqual(calls2, [], 'already-processed props are not re-emitted');
  assert.deepEqual(varMap, { 'var(--x)': '#ff0000' }, 'custom props keep feeding varMap');

  // a NEW property on the same node emits through the SAME reused selector
  values['border-color'] = '#dddddd';
  node.style.length = 3;
  node.style[2] = 'border-color';
  const calls3 = [];
  rewriteInlineNode(node, engineDefaults(), varMap, (...a) => calls3.push(a));
  assert.deepEqual(calls3, [[`html[data-nv-active] .${firstClass}`, 'border-color', 'var(--nv-edge)']]);
});

test('rewriteInlineNode: keys outside INLINE_PROPS never emit', () => {
  const node = fakeNode({ props: ['margin', 'color'], values: { margin: '10px', color: '#ffffff' } });
  const calls = [];
  rewriteInlineNode(node, engineDefaults(), {}, (...a) => calls.push(a));
  assert.deepEqual(calls, [[`html[data-nv-active] .${node._added}`, 'color', 'var(--nv-text)']]);
});

test('rewriteInlineNode: background-image mirrors the sheet path (veil, Nx skip, gradient none)', () => {
  const url = fakeNode({ props: ['background-image'], values: { 'background-image': 'url(a.png)' } });
  const c1 = [];
  rewriteInlineNode(url, engineDefaults(), {}, (...a) => c1.push(a));
  assert.deepEqual(c1, [[`html[data-nv-active] .${url._added}`, 'background-image',
    'linear-gradient(var(--nv-image-veil), var(--nv-image-veil)), url(a.png)']]);

  const icon = fakeNode({ props: ['background-image'], values: { 'background-image': 'url(icon-2x.png)' } });
  const c2 = [];
  rewriteInlineNode(icon, engineDefaults(), {}, (...a) => c2.push(a));
  assert.deepEqual(c2, [], 'Nx-suffixed icons stay untouched');

  const grad = fakeNode({ props: ['background-image'], values: { 'background-image': 'linear-gradient(#fff, #000)' } });
  const c3 = [];
  rewriteInlineNode(grad, engineDefaults(), {}, (...a) => c3.push(a));
  assert.deepEqual(c3, [[`html[data-nv-active] .${grad._added}`, 'background-image', 'none']],
    'gradient-only image collapses to none under removeGradients');
});
