# M2a · Adaptive Engine 核心实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付自适应引擎静态核心——颜色数学库、颜色改写契约、选择器改写、引擎自有样式表、跨域 SW 代取、`adaptive` 主题席位（默认切换），vars.html 逐项断言通过且 M1 基线不破。

**Architecture:** 引擎跑在 isolated content script（ADR-0004）。激活时挂 2 个受管 `<style>`（变量表 + 引擎输出表）、`<html data-nv-active>` 属性，遍历 `document.styleSheets` 把改写后的规则**复制**进引擎表（前缀 `html[data-nv-active]` 提升特异性）；跨域表经 background SW 代取文本后以克隆 `<style>` 落回。纯函数（颜色数学、契约、选择器改写）全部单测锁定；DOM 编排层（engine.js）经 fixtures + /tabbit 验收。

**Tech Stack:** ES Modules + esbuild（无新依赖）、node --test、/tabbit 运行时验收。

## Global Constraints

- **规格唯一来源**：`docs/M2-BEHAVIOR.md`（任务 0 已关门）——实现期**禁止**读 `dmghijelimhndkbmpgbldicpogfkceaj/` 下任何文件。
- 命名规范：CSS 变量 `--nv-*`、DOM 属性 `data-nv-*`、受管元素 id `nv-*`（沿用 M1 风格）。
- 激活属性：`data-nv-active`；前缀选择器：`html[data-nv-active]`；`:root` 形式 `:root[data-nv-active]`。
- 运行时文案只能来自 `src/shared/strings.js`（M2a 预计零新增文案——无 UI）。
- 零运行时依赖；devDependencies 不变。
- 每任务：`npm test` 全绿才提交；提交信息英文 conventional，含 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- M2a 范围边界：**不做** observer/重扫（M2b）、不做 30+ 选项 UI（M2c）、不做内联 style/Shadow DOM 处理（`processInlineStyles`/`processShadowStyles` 仅作 settings 字段占位，M2b 实现）。
- 引擎 settings 默认值 = M2-BEHAVIOR §8「默认值」列，逐字对齐。

---

### Task 1: 颜色数学库 `colorMath`

**Files:**
- Create: `src/shared/colorMath.js`
- Test: `tests/unit/color-math.test.mjs`

**Interfaces:**
- Produces（后续任务依赖的精确签名）:
  - `parseColor(str) → { r, g, b, a } | null`（r/g/b 0-255 整数，a 0-1）
  - `toHex8({ r, g, b, a }) → '#rrggbbaa'`（小写）
  - `luminanceOf({ r, g, b }) → number`（WCAG 相对亮度 0-1）
  - `darken(color, amount)` / `lighten(color, amount)`（HSL 空间，amount 0-1；darken: `l*(1-amount)`，lighten: `l+(1-l)*amount`）
  - `hslOf(color) → { h, s, l }`（h 0-360, s/l 0-1）
  - `NAMED_COLORS`（148 个 CSS 命名色 → '#rrggbb'）

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/color-math.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, toHex8, luminanceOf, darken, lighten, hslOf, NAMED_COLORS } from '../../src/shared/colorMath.js';

test('parses hex 3/4/6/8 forms', () => {
  assert.deepEqual(parseColor('#abc'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
  assert.deepEqual(parseColor('#abcd'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 0xdd / 255 });
  assert.deepEqual(parseColor('#292929'), { r: 0x29, g: 0x29, b: 0x29, a: 1 });
  assert.deepEqual(parseColor('#8db2e5cc'), { r: 0x8d, g: 0xb2, b: 0xe5, a: 0xcc / 255 });
});

test('parses rgb/rgba comma and space separated, hsl/hsla with percents', () => {
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseColor('rgba(10 20 30 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor('hsl(120, 50%, 50%)'), { r: 64, g: 191, b: 64, a: 1 });
  const h = parseColor('hsla(0, 100%, 50%, .25)');
  assert.equal(h.a, 0.25); assert.equal(h.r, 255);
});

test('parses the 148 named colors; unknown and modern syntax return null', () => {
  assert.equal(NAMED_COLORS.rebeccapurple, '#663399');
  assert.deepEqual(parseColor('cornflowerblue'), { r: 0x64, g: 0x95, b: 0xed, a: 1 });
  assert.equal(parseColor('oklch(0.5 0.1 20)'), null);
  assert.equal(parseColor('color-mix(in srgb, red, blue)'), null);
  assert.equal(parseColor('rgb(1 2 3 / 50%)'), null); // 斜杠透明度不在原版解析面内
});

test('toHex8 formats lowercase 8-digit hex', () => {
  assert.equal(toHex8({ r: 0x1a, g: 0x2b, b: 0x3c, a: 1 }), '#1a2b3cff');
  assert.equal(toHex8({ r: 255, g: 0, b: 15, a: 0 }), '#ff000f00');
});

test('luminance follows WCAG linearization anchors', () => {
  assert.equal(luminanceOf({ r: 0, g: 0, b: 0 }), 0);
  assert.equal(luminanceOf({ r: 255, g: 255, b: 255 }), 1);
  assert.ok(Math.abs(luminanceOf({ r: 0xd9, g: 0xdc, b: 0xdc }) - 0.716) < 0.005);
});

test('darken/lighten work in HSL space like the reference library', () => {
  const base = parseColor('#808080'); // l = 0.502
  const d = darken(base, 0.10);
  assert.ok(Math.abs(hslOf(d).l - 0.502 * 0.90) < 0.005);
  const l = lighten(base, 0.10);
  assert.ok(Math.abs(hslOf(l).l - (0.502 + 0.498 * 0.10)) < 0.005);
  assert.equal(d.a, 1, 'alpha preserved');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- tests/unit/color-math.test.mjs`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/shared/colorMath.js`**

```js
// src/shared/colorMath.js
// Minimal color math for the adaptive engine (ADR-0004: self-written, zero
// runtime deps). Parse surface mirrors the original capability face: hex
// 3/4/6/8, rgb/rgba & hsl/hsla in comma or space form (no slash-alpha), and
// the 148 CSS named colors. Modern syntax (oklch/lab/color()/color-mix)
// intentionally returns null — the contract layer then takes the fallback
// path (M2-BEHAVIOR §3-3).

export const NAMED_COLORS = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9',
  darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b', darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000',
  darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1',
  darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969',
  dimgrey: '#696969', dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0',
  forestgreen: '#228b22', fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff',
  gold: '#ffd700', goldenrod: '#daa520', gray: '#808080', green: '#008000',
  greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4',
  indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c',
  lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa',
  lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6',
  maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd',
  mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa',
  mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500',
  orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa',
  palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093',
  papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb',
  plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
  red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513',
  salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee',
  sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
  slategray: '#708090', slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f',
  steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8',
  tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
  white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
};

const HEX_RE = /^#([0-9a-f]{3,8})$/i;
const FUNC_RE = /^(rgba?|hsla?)\(([^)]*)\)$/i;

function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function fromHex(hex) {
  const h = hex.length === 3 || hex.length === 4
    ? [...hex].map((c) => c + c).join('')
    : hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const t = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  return { r: clamp255((t[0] + m) * 255), g: clamp255((t[1] + m) * 255), b: clamp255((t[2] + m) * 255) };
}

export function parseColor(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim().toLowerCase();
  if (!s) return null;
  const named = NAMED_COLORS[s];
  if (named) return fromHex(named.slice(1));
  const hex = HEX_RE.exec(s);
  if (hex && [3, 4, 6, 8].includes(hex[1].length)) return fromHex(hex[1]);
  const fn = FUNC_RE.exec(s);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,]+/).filter(Boolean);
  if (parts.some((p) => p.includes('/'))) return null; // slash-alpha outside parse face
  const num = (p, scale) => {
    const isPct = p.endsWith('%');
    const v = parseFloat(p);
    if (Number.isNaN(v)) return null;
    return isPct ? (v / 100) * scale : v;
  };
  if (fn[1].startsWith('rgb')) {
    if (parts.length < 3 || parts.length > 4) return null;
    const r = num(parts[0], 255), g = num(parts[1], 255), b = num(parts[2], 255);
    const a = parts[3] !== undefined ? num(parts[3], 1) : 1;
    if ([r, g, b, a].some((v) => v === null)) return null;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a };
  }
  // hsl family: parts must carry percent signs on s/l per CSS syntax; accept bare too
  if (parts.length < 3 || parts.length > 4) return null;
  const h = num(parts[0], 360), sat = num(parts[1], 1), l = num(parts[2], 1);
  const a = parts[3] !== undefined ? num(parts[3], 1) : 1;
  if ([h, sat, l, a].some((v) => v === null)) return null;
  const rgb = hslToRgb(h, Math.max(0, Math.min(1, sat)), Math.max(0, Math.min(1, l)));
  return { ...rgb, a };
}

export function toHex8({ r, g, b, a }) {
  const p = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}${p(a * 255)}`;
}

export function hslOf({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0));
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function shift(color, amount, mode) {
  const { h, s, l } = hslOf(color);
  const nl = mode === 'darken' ? l * (1 - amount) : l + (1 - l) * amount;
  return { ...hslToRgb(h, s, Math.max(0, Math.min(1, nl))), a: color.a };
}

export const darken = (c, amount) => shift(c, amount, 'darken');
export const lighten = (c, amount) => shift(c, amount, 'lighten');

export function luminanceOf({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- tests/unit/color-math.test.mjs`
Expected: PASS（7 tests）

- [ ] **Step 5: 提交**

```bash
git add src/shared/colorMath.js tests/unit/color-math.test.mjs
git commit -m "feat: minimal color math library for the adaptive engine"
```

---

### Task 2: 引擎主题常量 `engineTheme`

**Files:**
- Create: `src/shared/engineTheme.js`
- Test: `tests/unit/engine-theme.test.mjs`

**Interfaces:**
- Produces:
  - `ENGINE_VARIABLES`（18 个默认值对象，键 = `--nv-*` 新名，值 = M2-BEHAVIOR §9 默认值列）
  - `EXTRA_RULES_DEFAULT`（默认附加规则模板字符串）
  - `engineVarsCss(variables)` → `':root, ::after, ::before, ::backdrop { --nv-x: v; … }'`

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/engine-theme.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_VARIABLES, EXTRA_RULES_DEFAULT, engineVarsCss } from '../../src/shared/engineTheme.js';

test('18 variables with the contract defaults', () => {
  assert.equal(Object.keys(ENGINE_VARIABLES).length, 18);
  assert.equal(ENGINE_VARIABLES['--nv-surface'], '#292929');
  assert.equal(ENGINE_VARIABLES['--nv-text'], '#dcdcdc');
  assert.equal(ENGINE_VARIABLES['--nv-link'], '#8db2e5');
  assert.equal(ENGINE_VARIABLES['--nv-link-visited'], '#c76ed7');
  assert.equal(ENGINE_VARIABLES['--nv-cite'], '#92de92');
  assert.equal(ENGINE_VARIABLES['--nv-accent'], '#a9a9a9');
  assert.equal(ENGINE_VARIABLES['--nv-edge'], '#555555');
  assert.equal(ENGINE_VARIABLES['--nv-ink'], '#7d7d7d');
  assert.equal(ENGINE_VARIABLES['--nv-mark'], '#003d9b');
  assert.equal(ENGINE_VARIABLES['--nv-figure-opacity'], '0.85');
  assert.equal(ENGINE_VARIABLES['--nv-image-brightness'], '0.85');
  assert.equal(ENGINE_VARIABLES['--nv-shadow-box'], '0 0 0 1px rgb(255 255 255 / 10%)');
  assert.equal(ENGINE_VARIABLES['--nv-shadow-text'], 'none');
  assert.equal(ENGINE_VARIABLES['--nv-transparent'], 'transparent');
  assert.equal(ENGINE_VARIABLES['--nv-image-veil'], 'rgba(0, 0, 0, 0.10)');
  assert.equal(ENGINE_VARIABLES['--nv-image-filter'], 'brightness(50%) contrast(200%)');
  assert.equal(ENGINE_VARIABLES['--nv-blend'], 'multiply');
  assert.equal(ENGINE_VARIABLES['--nv-scrollbar'], 'auto');
});

test('vars css targets root and pseudos with every variable', () => {
  const css = engineVarsCss(ENGINE_VARIABLES);
  assert.ok(css.startsWith(':root, ::after, ::before, ::backdrop {'));
  for (const name of Object.keys(ENGINE_VARIABLES)) assert.ok(css.includes(`${name}: `));
});

test('extra rules default covers the documented surface', () => {
  assert.ok(EXTRA_RULES_DEFAULT.includes('color-scheme: dark'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-link)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-link-visited)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-cite)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-mark)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-figure-opacity)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-image-brightness)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-accent)'));
  assert.ok(EXTRA_RULES_DEFAULT.includes('var(--nv-scrollbar)'));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- tests/unit/engine-theme.test.mjs`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/shared/engineTheme.js`**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- tests/unit/engine-theme.test.mjs`
Expected: PASS（3 tests）

- [ ] **Step 5: 提交**

```bash
git add src/shared/engineTheme.js tests/unit/engine-theme.test.mjs
git commit -m "feat: engine variable table and default extra rules"
```

---

### Task 3: 颜色改写契约 `contract`

**Files:**
- Create: `src/content/engine/contract.js`
- Test: `tests/unit/engine-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `parseColor/toHex8/luminanceOf/darken/lighten/hslOf`。
- Produces:
  - `engineDefaults()` → 完整 engine settings 对象（默认值；Task 6 存入 DEFAULT_SETTINGS 时复用）
  - `rewriteColor(value, ctx)` → `string`；`ctx = { type: 'text'|'svg'|'background'|'border', engine, varMap, selectorText }`；`varMap: Map/对象`，键 `var(--x)` → 值
  - `gradientShadeValue(engine)` → 加深层字符串（b.4/b.5 用）
  - `isProcessableColor(value, type, engine)` → boolean（各类型合法值门，M2-BEHAVIOR §0-⑧ 同源）

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/engine-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineDefaults, rewriteColor, isProcessableColor } from '../../src/content/engine/contract.js';

const D = engineDefaults();

test('context-aware off → always the fallback variable', () => {
  const out = rewriteColor('#ffffff', { type: 'background', engine: { ...D, contextAware: false }, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'var(--nv-surface)');
});

test('transparent maps to the transparent variable', () => {
  const out = rewriteColor('transparent', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'var(--nv-transparent)');
});

test('invalid color with fallback disabled still returns the fallback variable (fall-through)', () => {
  const out = rewriteColor('inherit', { type: 'background', engine: { ...D, fallback: { ...D.fallback, enabled: false } }, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'var(--nv-surface)');
});

test('invalid color with fallback enabled mixes fallback with transparency', () => {
  const out = rewriteColor('var(--unknown-x)', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'color-mix(in srgb, var(--nv-surface) 90%, transparent)');
});

test('very light color (luminance above max, near-white degree past gate) → fallback variable', () => {
  // #fefefe: l=0.996 → bp=100, outside near-white gate [5,95] → plain fallback
  const out = rewriteColor('#fefefe', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'var(--nv-surface)');
});

test('mid-luminance color darkens 10% for background, lightens 10% for text', () => {
  const bg = rewriteColor('#808080', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  const fg = rewriteColor('#808080', { type: 'text', engine: D, varMap: {}, selectorText: '.card' });
  assert.match(bg, /^#[0-9a-f]{8}$/);
  assert.notEqual(bg, fg, 'background darkens, text lightens — different outputs');
});

test('bright mid-luminance color darkens 50% instead of 10%', () => {
  // #e0e0e0: luminance 0.745 ∈ (0.10, 0.75]; l 0.878 > 0.75 → isbright + darken → 50%
  const out = rewriteColor('#e0e0e0', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, '#707070ff');
});

test('dark color below min luminance is preserved', () => {
  const out = rewriteColor('#101010', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, '#101010');
});

test('pure black always preserved', () => {
  const out = rewriteColor('#000000', { type: 'background', engine: { ...D, preserveDarkColors: false }, varMap: {}, selectorText: '.card' });
  assert.equal(out, '#000000');
});

test('near-white adjustment blends fallback with a computed darker hex', () => {
  // #f4f6f8: l=0.9647 → bp=floor((0.2147/0.25)^1.1×105)=88 ∈ [5,95];
  // darker = floor(10×0.88)=8 subtracted from #292929 → #212121
  const out = rewriteColor('#f4f6f8', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'color-mix(in srgb, var(--nv-surface) 12%, #212121 88%)');
});

test('alpha preservation mixes fallback with transparent for translucent colors', () => {
  const out = rewriteColor('rgba(255, 255, 255, 0.4)', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'color-mix(in srgb, var(--nv-surface), transparent 60%)');
});

test('var() references resolve through the map before evaluation', () => {
  const out = rewriteColor('var(--page-bg)', { type: 'background', engine: D, varMap: { 'var(--page-bg)': '#ffffff' }, selectorText: 'body' });
  assert.equal(out, 'var(--nv-surface)');
});

test('gradient value: remove-color option wins, then darken prefix', () => {
  const removed = rewriteColor('linear-gradient(red, blue)', {
    type: 'background', engine: { ...D, removeGradientColors: true }, varMap: {}, selectorText: '.card',
  });
  assert.equal(removed, 'var(--nv-surface)');
  const darkened = rewriteColor('linear-gradient(red, blue)', {
    type: 'background', engine: { ...D, darkenGradients: true, removeGradientColors: false }, varMap: {}, selectorText: '.card',
  });
  assert.ok(darkened.startsWith(D.gradientShade + ', '));
});

test('low alpha below the floor is returned untouched', () => {
  const out = rewriteColor('rgba(255, 255, 255, 0.05)', { type: 'background', engine: D, varMap: {}, selectorText: '.card' });
  assert.equal(out, 'rgba(255, 255, 255, 0.05)');
});

test('processable gates per type', () => {
  assert.equal(isProcessableColor('inherit', 'text', D), false);
  assert.equal(isProcessableColor('currentcolor', 'text', D), false);
  assert.equal(isProcessableColor('#123456', 'text', D), true);
  assert.equal(isProcessableColor('none', 'svg', D), false);
  assert.equal(isProcessableColor('transparent', 'svg', D), false);
  assert.equal(isProcessableColor('red', 'svg', D), true);
  assert.equal(isProcessableColor('none', 'border', D), false);
  assert.equal(isProcessableColor('#fff', 'border', D), true);
  assert.equal(isProcessableColor('black', 'background', D), false);
  assert.equal(isProcessableColor('url(x.png)', 'background', D), false);
  assert.equal(isProcessableColor('inherit', 'background', D), false);
  assert.equal(isProcessableColor('initial', 'background', D), false);
  assert.equal(isProcessableColor('#f00', 'background', D), true);
  // gradient is processable only when one of the gradient options is on
  assert.equal(isProcessableColor('linear-gradient(a, b)', 'background', D), true);
  assert.equal(isProcessableColor('linear-gradient(a, b)', 'background', { ...D, removeGradientColors: false, darkenGradients: false }), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- tests/unit/engine-contract.test.mjs`
Expected: FAIL

- [ ] **Step 3: 实现 `src/content/engine/contract.js`**

```js
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
```

**注意**：`isProcessableColor('text')` 分支排除 `inherit/window/windowtext/currentcolor` 但**允许** `transparent`（transparent 走 `font-size: 0` 特例，Task 7 处理）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- tests/unit/engine-contract.test.mjs`
Expected: PASS（15 tests）。若 `mid-luminance` 断言失败（bg===fg），检查 method 选择是否按 type 正确分支。

- [ ] **Step 5: 提交**

```bash
git add src/content/engine/contract.js tests/unit/engine-contract.test.mjs
git commit -m "feat: engine color rewriting contract as a pure function"
```

---

### Task 4: 选择器改写 `selectors`

**Files:**
- Create: `src/content/engine/selectors.js`
- Test: `tests/unit/engine-selectors.test.mjs`

**Interfaces:**
- Consumes: `splitTopLevel`（`src/shared/siteThemes.js` 已有导出）。
- Produces:
  - `htmlPropTokens(doc)` → `string[]`（html 实时属性选择器 token：`#id`、`.class`、`[attr]`、`[attr="v"]`；排除 id/class/style/`data-nv-*`）
  - `transformSelector(selectorText, htmlProps, countFn)` → `string`（空串 = 整段丢弃）；`countFn(token) → number`（生产环境传 `t => document.querySelectorAll(t).length`，测试传桩）

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/engine-selectors.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { transformSelector } from '../../src/content/engine/selectors.js';

const KEY = 'html[data-nv-active]';
const none = () => 2;   // countFn 桩：html token 不独占（默认路径）
const solo = () => 0;   // countFn 桩：token 只命中 html 自身

test('plain selectors get the html prefix', () => {
  assert.equal(transformSelector('.card', [], none), `${KEY} .card`);
  assert.equal(transformSelector('.deep .inner .leaf', [], none), `${KEY} .deep .inner .leaf`);
});

test('comma groups transform per segment; pseudo-only segments dropped', () => {
  assert.equal(transformSelector('.a, .b', [], none), `${KEY} .a, ${KEY} .b`);
  assert.equal(transformSelector('::selection', [], none), '');
  assert.equal(transformSelector('.a, ::-webkit-scrollbar', [], none), `${KEY} .a`);
});

test('bare universal expands to both forms', () => {
  assert.equal(transformSelector('*', [], none), `${KEY}, ${KEY} *`);
  assert.equal(transformSelector('*.foo', [], none), `${KEY} *.foo`);
});

test('html/:root/:host segments rewrite in place', () => {
  assert.equal(transformSelector('html body', [], none), `${KEY} body`);
  assert.equal(transformSelector(':root', [], none), ':root[data-nv-active]');
  assert.equal(transformSelector(':host(.foo)', [], none), ':host(.foo[data-nv-active])');
});

test('html-matching attribute token chains without space when it targets html itself', () => {
  // [data-theme] matches html (count 0) → chained selector, no space
  assert.equal(transformSelector('[data-theme="dark"] .x', ['[data-theme]', '[data-theme="dark"]'], solo),
    `${KEY}[data-theme="dark"] .x`);
});

test('html-matching class token dual-forms when it also matches other elements', () => {
  // .dark matches html AND other nodes (count 2) → both chained and descendant
  assert.equal(transformSelector('.dark .x', ['.dark'], none),
    `${KEY}.dark .x, ${KEY} .dark .x`);
});

test('child combinator segment always uses the space form', () => {
  assert.equal(transformSelector('.dark > .x', ['.dark'], none), `${KEY} .dark > .x`);
});

test('function/attr commas are not split', () => {
  assert.equal(transformSelector(':is(a, b) .c', [], none), `${KEY} :is(a, b) .c`);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- tests/unit/engine-selectors.test.mjs`
Expected: FAIL

- [ ] **Step 3: 实现 `src/content/engine/selectors.js`**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- tests/unit/engine-selectors.test.mjs`
Expected: PASS（8 tests）

- [ ] **Step 5: 提交**

```bash
git add src/content/engine/selectors.js tests/unit/engine-selectors.test.mjs
git commit -m "feat: engine selector transform with html attribute chaining"
```

---

### Task 5: SW 跨域代取 `fetchCss`

**Files:**
- Create: `src/content/engine/fetchCss.js`
- Modify: `src/background/main.js`（追加消息监听）
- Test: `tests/unit/engine-fetch-css.test.mjs`

**Interfaces:**
- Produces:
  - `absolutizeUrls(css, baseUrl)` → 相对 url() 绝对化后的文本（纯函数，单测锁定）
  - `shouldFetch(href)` → boolean（http(s) 且非字体 URL；`.css` 或非 font 路径）
  - `fetchRemoteCss(href, { fetchImpl, sendToBackground })` → `Promise<string | null>`（同源页面 fetch + UTF-16 BOM 修正；跨源走 `sendToBackground(href) → Promise<{ok, content}>`）
- background 监听消息 `{ type: 'nv-engine-fetch-css', href }` → `sendResponse({ ok, content })`（返回 true 保持通道）。

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/engine-fetch-css.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { absolutizeUrls, shouldFetch, fetchRemoteCss } from '../../src/content/engine/fetchCss.js';

test('absolutizeUrls rewrites relative urls against the sheet base, keeps data/absolute', () => {
  const css = 'a{background:url(img/x.png)} b{background:url("y.png")} c{background:url(data:image/png;base64,AAA)} d{background:url(https://e/f.png)}';
  const out = absolutizeUrls(css, 'https://cdn.example.com/lib/sheet.css');
  assert.ok(out.includes('url(https://cdn.example.com/lib/img/x.png)'));
  assert.ok(out.includes('url("https://cdn.example.com/lib/y.png")'));
  assert.ok(out.includes('data:image/png;base64,AAA'));
  assert.ok(out.includes('url(https://e/f.png)'));
});

test('shouldFetch accepts http(s) css and non-font urls, rejects fonts and others', () => {
  assert.equal(shouldFetch('https://x.com/a.css'), true);
  assert.equal(shouldFetch('https://x.com/styles? v=2'), true); // http + not font
  assert.equal(shouldFetch('https://x.com/font.css'), false);
  assert.equal(shouldFetch('https://fonts.gstatic.com/s/font.woff2'), false);
  assert.equal(shouldFetch('https://x.com/assets/fonts/main.css'), false);
  assert.equal(shouldFetch('about:blank'), false);
  assert.equal(shouldFetch('//x.com/a.css'), true); // protocol-relative resolves to http
});

test('fetchRemoteCss prefers page fetch same-origin, background proxy cross-origin', async () => {
  const calls = { page: [], bg: [] };
  const pageFetch = async (href) => { calls.page.push(href); return { ok: true, clone: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }), text: async () => '.a{color:red}' }; };
  const bg = async (href) => { calls.bg.push(href); return { ok: true, content: '.b{color:blue}' }; };
  const same = await fetchRemoteCss('https://site.com/x.css', { fetchImpl: pageFetch, sendToBackground: bg });
  assert.equal(same, '.a{color:red}');
  assert.equal(calls.bg.length, 0);
  const cross = await fetchRemoteCss('https://cdn.other.com/x.css', { fetchImpl: pageFetch, sendToBackground: bg });
  assert.equal(cross, '.b{color:blue}');
  assert.deepEqual(calls.bg, ['https://cdn.other.com/x.css']);
});

test('fetchRemoteCss returns null on page-fetch failure after background fallback fails too', async () => {
  const pageFetch = async () => { throw new Error('cors'); };
  const bg = async () => ({ ok: false, content: null });
  assert.equal(await fetchRemoteCss('https://site.com/x.css', { fetchImpl: pageFetch, sendToBackground: bg }), null);
});

test('html responses are discarded', async () => {
  const pageFetch = async () => ({ ok: true, clone: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }), text: async () => '<!DOCTYPE html><html></html>' });
  assert.equal(await fetchRemoteCss('https://site.com/x.css', { fetchImpl: pageFetch, sendToBackground: async () => ({ ok: false }) }), null);
});

test('nul bytes trigger utf-16 re-decode', async () => {
  const buf = new Uint16Array(['.'.codePointAt(0), 'a'.codePointAt(0)]).buffer;
  const pageFetch = async () => ({ ok: true, clone: () => ({ arrayBuffer: async () => buf }), text: async () => '\x00.a' });
  const out = await fetchRemoteCss('https://site.com/x.css', { fetchImpl: pageFetch, sendToBackground: async () => ({ ok: false }) });
  assert.equal(out, '.a');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- tests/unit/engine-fetch-css.test.mjs`
Expected: FAIL

- [ ] **Step 3: 实现 `src/content/engine/fetchCss.js`**

```js
// src/content/engine/fetchCss.js
// Cross-origin stylesheet recovery (M2-BEHAVIOR §5): cssRules of cross-origin
// sheets throw, so the text is fetched (same-origin directly from the page,
// cross-origin via the background service worker which holds
// host_permissions) and re-inserted as a cloned <style> for scanning.

const RELATIVE_URL_RE = /url\((?!['"]?(?:data:|https?:|\/\/))(['"]?)([^'")]*)\1\)/g;

export function absolutizeUrls(css, baseUrl) {
  return css.replace(RELATIVE_URL_RE, (match, q, path) => {
    try { return `url(${q}${new URL(path, baseUrl).href}${q})`; } catch { return match; }
  });
}

export function shouldFetch(href) {
  if (!href) return false;
  let abs = href;
  if (href.startsWith('//')) abs = `https:${href}`;
  if (!/^https?:/i.test(abs)) return false;
  const relative = abs.replace(/^.*:\/\//i, '');
  const notFont = !/font\.|font-|\/font/i.test(abs) && !/fonts\.|fonts-|\/fonts/i.test(abs);
  return abs.endsWith('.css') || notFont;
}

async function sendViaRuntime(href) {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'nv-engine-fetch-css', href }, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false });
      else resolve(res ?? { ok: false });
    });
  });
}

export async function fetchRemoteCss(href, { fetchImpl = (...a) => fetch(...a), sendToBackground = sendViaRuntime } = {}) {
  if (!shouldFetch(href)) return null;
  const abs = href.startsWith('//') ? `https:${href}` : href;
  const origin = new URL(abs, document.location.href).origin;
  if (origin === document.location.origin) {
    try {
      const response = await fetchImpl(abs, { cache: 'default' });
      if (response?.ok) {
        let content = await response.text();
        if (content.includes('\x00')) {
          const buffer = await response.clone().arrayBuffer();
          content = buffer ? new TextDecoder('utf-16').decode(buffer) : content;
        }
        if (content.includes('<!DOCTYPE html>')) return null;
        return content;
      }
    } catch { /* fall through to background proxy */ }
  }
  const viaBg = await sendToBackground(abs);
  if (viaBg?.ok && viaBg.content && !viaBg.content.includes('<!DOCTYPE html>')) return viaBg.content;
  return null;
}
```

- [ ] **Step 4: 在 `src/background/main.js` 末尾追加 SW 代取监听**

```js
// Cross-origin stylesheet proxy for the adaptive engine (M2a): content
// scripts are page-CORS-bound; the SW holds host_permissions so it can read
// any sheet the page could load (M2-BEHAVIOR §5).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'nv-engine-fetch-css' || !/^https?:/i.test(msg.href ?? '')) return false;
  fetch(msg.href, { cache: 'default' })
    .then((r) => r.text())
    .then((content) => sendResponse({ ok: true, content }))
    .catch(() => sendResponse({ ok: false }));
  return true; // async sendResponse
});
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- tests/unit/engine-fetch-css.test.mjs`
Expected: PASS（6 tests）

- [ ] **Step 6: 提交**

```bash
git add src/content/engine/fetchCss.js src/background/main.js tests/unit/engine-fetch-css.test.mjs
git commit -m "feat: cross-origin stylesheet recovery via SW proxy"
```

---

### Task 6: settings 引擎默认值 + 深合并 + 席位与兼容标记

**Files:**
- Modify: `src/shared/settings.js`
- Modify: `src/shared/siteThemes.js`（google 加 `compatible: true`）
- Test: modify `tests/unit/settings.test.mjs`、`tests/unit/site-themes.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `engineDefaults()`。
- Produces:
  - `DEFAULT_SETTINGS.themeId === 'adaptive'`（默认主题切换，拍板 1）
  - `DEFAULT_SETTINGS.engine`（= `engineDefaults()` 内容）
  - `loadSettings` 对嵌套组（`exclusionRules`、`engine`）做一级深合并
  - `SITE_THEMES` 中 google 带 `compatible: true`

- [ ] **Step 1: 改失败测试**

在 `tests/unit/settings.test.mjs` 追加：

```js
test('engine settings default and one-level deep merge for nested groups', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { engine: { highPriority: true } } });
  const s = await loadSettings(mem);
  assert.equal(s.themeId, 'adaptive', 'factory default theme is the engine seat');
  assert.equal(s.engine.highPriority, true, 'stored override wins');
  assert.equal(s.engine.siteThemePolicy, 'skip-compatible', 'missing fields backfill');
  assert.equal(s.engine.luminanceRange.max, 75);
  assert.deepEqual(s.engine.variables['--nv-surface'], '#292929');
});

test('legacy full-engine-absent settings upgrade keeps exclusionRules backfill', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { state: 'dark', themeId: 'nv-midnight' } });
  const s = await loadSettings(mem);
  assert.equal(s.engine.contextAware, true);
  assert.equal(s.exclusionRules.metaScheme, true);
});
```

在 `tests/unit/site-themes.test.mjs` 追加：

```js
test('google is the compatible site theme that yields to the engine', () => {
  const google = SITE_THEMES.find((t) => t.id === 'google');
  assert.equal(google.compatible, true);
  assert.equal(SITE_THEMES.filter((t) => t.compatible).length, 1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- tests/unit/settings.test.mjs tests/unit/site-themes.test.mjs`
Expected: FAIL（themeId 断言、engine 字段缺失、compatible 缺失）

- [ ] **Step 3: 实现**

`src/shared/settings.js`——头部加 import、替换 merge、改 themeId 默认、DEFAULT 加 engine：

```js
import { engineDefaults } from '../content/engine/contract.js';
```
（放在文件顶部 import 区；`engineDefaults` 是纯函数无 DOM 依赖，shared 引 content 模块仅此一处，如有循环依赖担忧可将 contract.js 移至 `src/shared/engineContract.js`——**决定：保持 `src/content/engine/contract.js`，esbuild bundler 与 node --test 均无循环（contract 只 import shared/colorMath 与 shared/engineTheme）。**）

```js
export const DEFAULT_SETTINGS = Object.freeze({
  state: 'light',
  themeId: 'adaptive',    // engine seat — factory default (M2-BEHAVIOR §11 拍板 1)
  // ...（其余字段原样不动）
  engine: engineDefaults(),
});

const NESTED_GROUPS = ['exclusionRules', 'engine'];
function mergeWithDefaults(stored) {
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  for (const group of NESTED_GROUPS) {
    merged[group] = { ...DEFAULT_SETTINGS[group], ...(stored?.[group] ?? {}) };
  }
  return merged;
}
```

`src/shared/siteThemes.js`——google 条目加字段：

```js
  {
    id: 'google', label: 'Google', hosts: ['google.com'], compatible: true,
    // ...css 原样
```

- [ ] **Step 4: 全量跑测试（注意既有测试可能受默认值影响）**

Run: `npm test`
Expected: 若 `palettes.test.mjs` 或 options 相关断言引用默认 `nv-simple`，按 MILESTONES M2a 条目「M1 基线测试前提同步调整」更新断言（改为 `'adaptive'` 或改用显式 `themeId` 输入）。全绿。

- [ ] **Step 5: 提交**

```bash
git add src/shared/settings.js src/shared/siteThemes.js tests/unit/settings.test.mjs tests/unit/site-themes.test.mjs
git commit -m "feat: adaptive engine seat as factory default theme with nested-group merge"
```

---

### Task 7: 引擎核心与管线接入

**Files:**
- Create: `src/content/engine/engine.js`
- Modify: `src/content/main.js`
- Test: `tests/unit/engine-rule-text.test.mjs`（纯 helper）；DOM 编排经 Task 8 tabbit 验收

**Interfaces:**
- Consumes: Task 2 `engineVarsCss/EXTRA_RULES_DEFAULT/ENGINE_VARIABLES`；Task 3 `rewriteColor/isProcessableColor`；Task 4 `transformSelector/htmlPropTokens`；Task 5 `fetchRemoteCss/absolutizeUrls`。
- Produces:
  - `activateEngine(settings)` / `deactivateEngine()`（main.js 调用）
  - `buildRuleText(selector, prop, value, { priority })` → `'sel { prop: value !important }'`（纯函数，单测）
  - 受管元素 id：`nv-engine-vars`、`nv-engine-sheet`；克隆属性：`data-nv-cloned`

- [ ] **Step 1: 写失败测试（纯 helper）**

```js
// tests/unit/engine-rule-text.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuleText } from '../../src/content/engine/engine.js';

test('buildRuleText assembles selector/prop/value with optional priority', () => {
  assert.equal(buildRuleText('html[data-nv-active] .a', 'color', 'red', { priority: true }),
    'html[data-nv-active] .a { color: red !important }');
  assert.equal(buildRuleText('html[data-nv-active] .a', 'color', 'red', { priority: false }),
    'html[data-nv-active] .a { color: red }');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- tests/unit/engine-rule-text.test.mjs`
Expected: FAIL

- [ ] **Step 3: 实现 `src/content/engine/engine.js`**

```js
// src/content/engine/engine.js
// Static engine core (M2a): activates by mounting the variable block and the
// engine output sheet, marking <html data-nv-active>, and copying rewritten
// rules from every reachable stylesheet into the engine sheet. Change
// tracking, inline styles and shadow DOM land in M2b.
import { ENGINE_VARIABLES, EXTRA_RULES_DEFAULT, engineVarsCss } from '../../shared/engineTheme.js';
import { rewriteColor, isProcessableColor } from './contract.js';
import { transformSelector, htmlPropTokens } from './selectors.js';
import { fetchRemoteCss, absolutizeUrls } from './fetchCss.js';

export const VARS_STYLE_ID = 'nv-engine-vars';
export const SHEET_STYLE_ID = 'nv-engine-sheet';
export const ACTIVE_ATTR = 'data-nv-active';
const CLONED_ATTR = 'data-nv-cloned';

export function buildRuleText(selector, prop, value, { priority }) {
  return `${selector} { ${prop}: ${value}${priority ? ' !important' : ''} }`;
}

const state = { sheetEl: null, varsEl: null, rulesIndex: new Map(), engine: null, varMap: {} };

function prop(rule, name) { return rule.style.getPropertyValue(name) || rule.style[name] || ''; }

function insertEngineRule(selector, prop, value, priority) {
  const css = buildRuleText(selector, prop, value, { priority });
  const key = `${selector}∣${prop}`;
  const existing = state.rulesIndex.get(selector);
  if (existing !== undefined && state.sheetEl?.sheet) {
    // same selector already rewritten → update in place when possible
    try {
      for (let i = 0; i < state.sheetEl.sheet.cssRules.length; i++) {
        if (state.sheetEl.sheet.cssRules[i].selectorText === selector) {
          state.sheetEl.sheet.cssRules[i].style.setProperty(prop, value, priority ? 'important' : '');
          state.rulesIndex.set(key, i);
          return;
        }
      }
    } catch { /* fall through to insert */ }
  }
  try {
    const index = state.sheetEl.sheet.insertRule(css, 0);
    state.rulesIndex.set(selector, index);
    state.rulesIndex.set(key, index);
  } catch { /* invalid selector — skip silently, matches original tolerance */ }
}

function emit(rule, propName, value) {
  const selector = transformSelector(rule.selectorText, htmlPropTokens(document), (t) => document.querySelectorAll(t).length);
  if (!selector) return;
  const priority = state.engine.highPriority
    || rule.style.getPropertyPriority(propName) === 'important';
  insertEngineRule(selector, propName, value, priority);
}

function rewriteStyleRule(rule) {
  const e = state.engine;
  const varMap = state.varMap;
  if (e.mapCssVariables) collectCustomProps(rule);

  if (e.darken.text) {
    const v = prop(rule, 'color');
    if (v && v !== 'var(--nv-text)' && isProcessableColor(v, 'text', e)) {
      if (v.trim() === 'transparent') emit(rule, 'font-size', '0');       // §10 quirk
      else emit(rule, 'color', rewriteColor(v, { type: 'text', engine: e, varMap, selectorText: rule.selectorText }));
    }
  }
  if (e.darken.svgFill || e.darken.svgStroke) {
    for (const [name, on] of [['fill', e.darken.svgFill], ['stroke', e.darken.svgStroke]]) {
      const v = prop(rule, name);
      if (on && v && v !== 'var(--nv-ink)' && isProcessableColor(v, 'svg', e)) {
        emit(rule, name, rewriteColor(v, { type: 'svg', engine: e, varMap, selectorText: rule.selectorText }));
      }
    }
  }
  if (e.darken.boxShadow || e.darken.textShadow) {
    for (const [name, on, varName] of [['box-shadow', e.darken.boxShadow, '--nv-shadow-box'], ['text-shadow', e.darken.textShadow, '--nv-shadow-text']]) {
      const v = prop(rule, name);
      if (on && v && v !== 'none' && !v.includes('transparent') && v !== `var(${varName})`) {
        emit(rule, name, `var(${varName})`);
      }
    }
  }
  if (e.darken.border) {
    const sides = ['', '-top', '-left', '-right', '-bottom'];
    for (const side of sides) {
      const color = prop(rule, `border${side}-color`) || (side === '' ? prop(rule, 'border') : '');
      const width = side === '' ? prop(rule, 'border-width') : prop(rule, `border${side}-width`);
      if (!color || color === 'var(--nv-edge)') continue;
      if (e.borderNeedsWidth && !width) continue;
      if (!isProcessableColor(color, 'border', e)) continue;
      emit(rule, side === '' ? 'border-color' : `border${side}-color`,
        rewriteColor(color, { type: 'border', engine: e, varMap, selectorText: rule.selectorText }));
    }
  }
  // background-color / background shorthand / background-image
  const bgColor = prop(rule, 'background-color');
  if (e.darken.background && bgColor && isProcessableColor(bgColor, 'background', e)) {
    const value = rewriteColor(bgColor, { type: 'background', engine: e, varMap, selectorText: rule.selectorText });
    if (value !== bgColor || bgColor === 'transparent') {
      emit(rule, 'background-color', value);
      if (e.backgroundBlend) emit(rule, 'background-blend-mode', 'var(--nv-blend)');
    }
  }
  const bgAll = prop(rule, 'background');
  if (e.darken.background && bgAll && isProcessableColor(bgAll, 'background', e) && bgAll.indexOf('-gradient(') !== -1) {
    const value = rewriteColor(bgAll, { type: 'background', engine: e, varMap, selectorText: rule.selectorText });
    emit(rule, 'background', value);
  }
  const bgImage = prop(rule, 'background-image');
  if (e.darkenBackgroundImages && bgImage && bgImage !== 'none') {
    if (bgImage.indexOf('url(') !== -1 && !/-\d+x|\d+x[-_]/.test(bgImage)) {
      emit(rule, 'background-image', `linear-gradient(var(--nv-image-veil), var(--nv-image-veil)), ${bgImage}`);
      if (e.preserveBackgroundProps) {
        const repeat = prop(rule, 'background-repeat');
        const position = prop(rule, 'background-position');
        if (repeat && !(e.ignoreInitialProps && repeat === 'initial')) emit(rule, 'background-repeat', repeat);
        if (position && !(e.ignoreInitialProps && position === 'initial')) emit(rule, 'background-position', position);
      }
    } else if (bgImage.indexOf('-gradient(') !== -1 && e.removeGradients) {
      emit(rule, 'background-image', 'none');
    }
  }
}

function collectCustomProps(rule) {
  const style = rule.style;
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    if (typeof name === 'string' && name.startsWith('--') && !name.startsWith('--nv-')) {
      state.varMap[`var(${name})`] = style.getPropertyValue(name).trim();
    }
  }
}

function visitRule(rule, depth) {
  const e = state.engine;
  if (rule.href) { requestSheetFetch(rule.href, rule.parentStyleSheet?.ownerNode); return; }
  if (rule.style) { rewriteStyleRule(rule); return; }
  const type = rule.constructor.name;
  const isMedia = type === 'CSSMediaRule', isSupports = type === 'CSSSupportsRule', isKeyframes = type === 'CSSKeyframesRule';
  if (isMedia && !e.processMediaQueries) return;
  if (isSupports && !e.processSupports) return;
  if (isKeyframes && !e.processKeyframes) return;
  const deeper = isMedia || isSupports || isKeyframes ? false : e.deepRules;
  if (!rule.cssRules) return;
  for (const child of rule.cssRules) {
    if (child.style) rewriteStyleRule(child);
    else if (deeper || ((child.constructor.name === 'CSSMediaRule' && e.processMediaQueries)
      || (child.constructor.name === 'CSSSupportsRule' && e.processSupports)
      || (child.constructor.name === 'CSSKeyframesRule' && e.processKeyframes))) visitRule(child, depth + 1);
  }
}

const fetched = new Set();
async function requestSheetFetch(href, ownerNode) {
  if (fetched.has(href)) return;
  fetched.add(href);
  const content = await fetchRemoteCss(href);
  if (!content) return;
  const style = document.createElement('style');
  style.setAttribute(CLONED_ATTR, '');
  const abs = absolutizeUrls(content, href);
  style.textContent = abs;
  (ownerNode ?? document.head).appendChild(style);
  if (style.sheet) scanSheet(style.sheet);
  else requestAnimationFrame(() => style.sheet && scanSheet(style.sheet));
}

function scanSheet(sheet) {
  let rules;
  try { rules = sheet.cssRules; } catch { // cross-origin without fetch path — skip
    if (sheet.href) requestSheetFetch(sheet.href, sheet.ownerNode);
    return;
  }
  if (!rules) return;
  for (const rule of rules) visitRule(rule, 0);
}

function collectRootVarMap() {
  try {
    const map = document.documentElement.computedStyleMap?.();
    if (!map) return;
    for (const [name, value] of map) {
      if (name.startsWith('--') && !name.startsWith('--nv-')) {
        state.varMap[`var(${name})`] = (value?.[0]?.[0] ?? '').trim();
      }
    }
  } catch { /* non-Chromium or detached — rule-level map still works */ }
}

export function activateEngine(settings) {
  const engine = settings.engine;
  state.engine = engine;
  state.rulesIndex = new Map();
  state.varMap = {};
  document.documentElement.setAttribute(ACTIVE_ATTR, '');

  const vars = engineVarsCss({ ...ENGINE_VARIABLES, ...(engine.variables ?? {}) });
  const extra = engine.extraRules ?? EXTRA_RULES_DEFAULT;
  state.varsEl = mountStyle(VARS_STYLE_ID, `${vars}\n${extra}`);
  state.sheetEl = mountStyle(SHEET_STYLE_ID, '');

  collectRootVarMap();
  for (const sheet of document.styleSheets) scanSheet(sheet);
}

function mountStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    (document.head ?? document.documentElement).appendChild(el);
  }
  el.textContent = css;
  return el;
}

export function deactivateEngine() {
  document.documentElement?.removeAttribute(ACTIVE_ATTR);
  for (const id of [VARS_STYLE_ID, SHEET_STYLE_ID]) document.getElementById(id)?.remove();
  state.varsEl = null;
  state.sheetEl = null;
  state.rulesIndex = new Map();
  for (const el of document.querySelectorAll(`[${CLONED_ATTR}]`)) el.setAttribute('disabled', '');
}
```

- [ ] **Step 4: 修改 `src/content/main.js` 接入席位**

在 import 区追加：

```js
import { activateEngine, deactivateEngine, ACTIVE_ATTR } from './engine/engine.js';
import { ENGINE_VARIABLES } from '../shared/engineTheme.js';
```

`applyTheme` 拆为引擎/经典两路——在 `applyTheme(settings)` 顶部插入席位分派：

```js
function applyTheme(settings) {
  const site = matchSiteTheme(location.hostname);
  const siteUsable = site && !(settings.disabledSiteThemes ?? []).includes(site.id);
  if (settings.themeId === 'adaptive') { applyEngine(settings, site, siteUsable); return; }
  applyClassic(settings, site, siteUsable);
}

function engineOwnsSite(policy, site) {
  // M2-BEHAVIOR §1: respect → site theme wins; ignore → engine always;
  // skip-compatible → engine only on compatible-marked sites.
  if (!site) return true;
  if (policy === 'ignore') return true;
  if (policy === 'respect') return false;
  return Boolean(site.compatible);
}

function applyEngine(settings, site, siteUsable) {
  armGuard(settings, ENGINE_VARIABLES['--nv-surface']);   // guard with the engine surface color
  if (engineOwnsSite(settings.engine.siteThemePolicy, siteUsable ? site : null)) {
    removeStyle(SITE_STYLE_ID);
    document.documentElement.removeAttribute(SITE_ATTR);
    activateEngine(settings);
    return;
  }
  deactivateEngine();
  document.documentElement.setAttribute(SITE_ATTR, site.id);
  injectStyle(SITE_STYLE_ID, compileSiteTheme(site.id));
}

function applyClassic(settings, site, siteUsable) {
  deactivateEngine();
  armGuard(settings);
  injectStyle(CLASSIC_STYLE_ID, compileThemeById(settings.themeId));
  if (siteUsable) {
    document.documentElement.setAttribute(SITE_ATTR, site.id);
    injectStyle(SITE_STYLE_ID, compileSiteTheme(site.id));
  } else {
    removeStyle(SITE_STYLE_ID);
    document.documentElement.removeAttribute(SITE_ATTR);
  }
  markMediaStages();
  markFullscreenOverlays();
  recallZeroSizeText();
  window.addEventListener('load', () => {
    if (document.getElementById(CLASSIC_STYLE_ID)) {
      markMediaStages();
      markFullscreenOverlays();
      recallZeroSizeText();
    }
  }, { once: true });
}
```

`armGuard` 增加 bg 覆盖参数（原实现其余不动）：

```js
function armGuard(settings, bgOverride) {
  const bg = bgOverride ?? guardBackgroundFor(findPalette(settings.themeId));
  // ...其余原样
}
```

`teardown()` 增加引擎清理一行：

```js
function teardown() {
  removeStyle(CLASSIC_STYLE_ID);
  removeStyle(GUARD_STYLE_ID);
  removeStyle(SITE_STYLE_ID);
  deactivateEngine();
  // ...其余原样
}
```

`findPalette('adaptive')` 会回落首调色板——仅 guard 取色路径经过它，而引擎路径已传 `bgOverride`，无实际影响；`render()` 不需要改（`applyTheme` 内部分派）。

- [ ] **Step 5: 全量跑测试**

Run: `npm test`
Expected: 全绿（新增 engine-rule-text 2 用例 + 既有 36+ 全部通过）

- [ ] **Step 6: 构建**

Run: `npm run build`
Expected: esbuild 三入口打包无报错

- [ ] **Step 7: 提交**

```bash
git add src/content/engine/engine.js src/content/main.js tests/unit/engine-rule-text.test.mjs
git commit -m "feat: static adaptive engine core wired into the theme seat"
```

---

### Task 8: 验收——vars.html 断言 + M1 回归 + 默认主题核验

**Files:**
- 无新源码文件；`docs/MILESTONES.md` 勾选 M2a（验收通过后）

**Interfaces:**
- Consumes: 全部前置任务的构建产物（`npm run build` 后的 `extension/`）。

- [ ] **Step 1: 构建 + 单测全绿**

Run: `npm run build && npm test`
Expected: 构建无错；测试全绿。

- [ ] **Step 2: 启动 fixtures 并用 /tabbit 验收 vars.html**

Run: `npm run fixtures`（8123 端口保持运行）
用 `/tabbit` 技能执行（重载扩展 → 打开 `http://localhost:8123/vars.html` → 断言 + 截图）。断言清单（写入 tabbit 指令）：

```
1. 全局切 Dark（默认主题已是 adaptive，无需选主题）
2. 断言 <html> 有 data-nv-active 属性
3. 断言 getComputedStyle(document.querySelector('.card')).backgroundColor 不再是 rgb(244, 246, 248)（原浅色被改写）
4. 断言 getComputedStyle(document.querySelector('.deep .inner .leaf')).backgroundColor 同样被改写（深嵌套）
5. 断言 .card 内 <a> 的 color 为 rgb(141, 178, 229)（var(--nv-link) #8db2e5）
6. 断言 body 的 color 不再是 rgb(26, 26, 26)（原深色文字变浅）
7. 断言 getComputedStyle(document.documentElement).getPropertyValue('--nv-surface') === '#292929'（变量表已注入）
8. 断言 nv-guard 样式在 Dark 后 2s 内移除
9. 截图目视：整页暗色、文字可读、无白闪残留
10. 切 Light：断言 data-nv-active 移除、#nv-engine-vars 与 #nv-engine-sheet 均不在 DOM
11. 重新切 Dark：断言引擎重新激活（步骤 2-5 复验）
```

Expected: 全部通过；失败则按自主迭代协议循环修复（同问题 3 次失败停下汇报）。

- [ ] **Step 3: M1 回归冒烟（plain / media）**

用 /tabbit 依次打开 `http://localhost:8123/plain.html`、`http://localhost:8123/media.html`：

```
plain: Dark 后整页暗色、Light 拆除干净（nv-engine-* 与 nv-classic 均移除）
media: Dark 后 <video>/<img> 可见性不受引擎路径破坏（页面默认走引擎；视频元素因
       extraRules 的 img/image brightness 滤镜规则轻度压暗属预期）
```

再手动把主题切回某个 Classic Theme（如 nv-midnight——需要 M1b 选项页或直接写 storage）复核经典路径未回归：`plain.html` Dark 着色与 M1b 基线一致。

- [ ] **Step 4: 更新 MILESTONES 并提交**

M2a 条目勾选 + 验收证据段（tabbit 结果、截图位置、测试计数）。提交：

```bash
git add docs/MILESTONES.md
git commit -m "docs: M2a acceptance evidence"
```

---

## Self-Review 记录

- **规格覆盖**：M2-BEHAVIOR §1（席位/策略→Task 6/7）、§2（接管流程→Task 7/8）、§3（契约→Task 3）、§4（选择器→Task 4）、§5（来源处理→Task 5/7；shadow/inline 为 M2b 边界已在 Global Constraints 声明）、§8/§9（默认值→Task 2/3/6）、§10 怪癖（transparent→font-size:0 在 Task 7；Nx 图标跳过在 Task 7 正则）。
- **占位符扫描**：无 TBD/「适当处理」；全部代码块完整。
- **类型一致性**：`rewriteColor(value, {type, engine, varMap, selectorText})` 在 Task 3 定义、Task 7 消费一致；`transformSelector(selectorText, htmlProps, countFn)` 同；`engineDefaults()` 键名与 Task 6 DEFAULT_SETTINGS.engine 一致；`buildRuleText` 测试与实现签名一致。
- **已知取舍**：`visitRule` 用 `constructor.name` 判规则类型（Chromium 目标下稳定，esbuild iife 不做压缩混淆）；@keyframes 改写在 M2a 只走 `processKeyframes` 关口（默认关，深度遍历分支已留），完整关键帧复制属 M2b 观察器一并打磨——已在 Global Constraints 边界内。
