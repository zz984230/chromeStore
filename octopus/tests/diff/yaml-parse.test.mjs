// tests/diff/yaml-parse.test.mjs — YAML 常用配置子集解析(wave-3 Task 1 块结构 + Task 2 标量细节/flow)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from '../../src/tools/diff/shared/yaml-parse.js';
import { normalizeYaml } from '../../src/tools/diff/shared/norm-yaml.js';

const v = (t, x) => (t === 'null' ? { t } : { t, v: x });
const map = (o) => ({ t: 'map', v: o });
const arr = (x) => ({ t: 'arr', v: x });

test('parseYaml 块映射:嵌套/注释/空值/重复键拒', () => {
  const r = parseYaml('server:\n  port: 8080\n  host: localhost # 行尾注释\n  debug:\n');
  assert.deepEqual(r.value, map({ server: map({ port: v('int', 8080), host: v('str', 'localhost'), debug: v('null') }) }));
  assert.equal(parseYaml('a: 1\na: 2\n').ok, false);
});

test('parseYaml 块序列:字面项/嵌套块/seq-of-map 紧凑形', () => {
  const a = parseYaml('items:\n  - 1\n  - 2\n');
  assert.deepEqual(a.value, map({ items: arr([v('int', 1), v('int', 2)]) }));
  const b = parseYaml('apps:\n  - name: web\n    port: 80\n  - name: db\n    port: 5432\n');
  assert.deepEqual(b.value, map({ apps: arr([
    map({ name: v('str', 'web'), port: v('int', 80) }),
    map({ name: v('str', 'db'), port: v('int', 5432) }),
  ]) }));
  const c = parseYaml('- - 1\n  - 2\n');
  assert.deepEqual(c.value, arr([arr([v('int', 1), v('int', 2)])]));
});

test('parseYaml 併格序列:键下同缩进序列项即其值', () => {
  const r = parseYaml('k:\n- 1\n- 2\n');
  assert.deepEqual(r.value, map({ k: arr([v('int', 1), v('int', 2)]) }));
});

test('parseYaml 顶层:裸映射/裸序列/裸标量/空文档', () => {
  assert.deepEqual(parseYaml('k: v\n').value, map({ k: v('str', 'v') }));
  assert.deepEqual(parseYaml('- a\n').value, arr([v('str', 'a')]));
  assert.deepEqual(parseYaml('just a string\n').value, v('str', 'just a string'));
  assert.deepEqual(parseYaml('').value, v('null'));
  assert.deepEqual(parseYaml('---\nk: v\n...\n').value, map({ k: v('str', 'v') }));
});

test('parseYaml 文档标记行尾注释:裸标记不因 #c 误拒(复审 R10)', () => {
  assert.deepEqual(parseYaml('k: v\n... # c\n').value, map({ k: v('str', 'v') }));
  assert.deepEqual(parseYaml('--- # c\nk: v\n').value, map({ k: v('str', 'v') }));
});

test('parseYaml 类型推断 1.2 核心:bool/null/int/float/inf/nan;no/On 不是 bool', () => {
  const r = parseYaml('a: true\nb: False\nc: ~\nd: null\ne: -17\nf: 1.5\ng: 1e2\nh: .inf\ni: -.nan\nj: no\nk: On\n');
  const x = r.value.v;
  assert.deepEqual(x.a, v('bool', true));
  assert.deepEqual(x.b, v('bool', false));
  assert.deepEqual(x.c, v('null'));
  assert.deepEqual(x.d, v('null'));
  assert.deepEqual(x.e, v('int', -17));
  assert.deepEqual(x.f, v('float', 1.5));
  assert.deepEqual(x.g, v('float', 100));
  assert.deepEqual(x.h, v('float', Infinity));
  assert.ok(Number.isNaN(x.i.v));
  assert.deepEqual(x.j, v('str', 'no'));
  assert.deepEqual(x.k, v('str', 'On'));
});

test('parseYaml 日期不推断:视作字符串', () => {
  const r = parseYaml('d: 1979-05-27\nt: 1979-05-27T07:32:00Z\n');
  assert.deepEqual(r.value.v.d, v('str', '1979-05-27'));
  assert.deepEqual(r.value.v.t, v('str', '1979-05-27T07:32:00Z'));
});

test('parseYaml 子集外拒:锚点/别名/合并键/多文档/标签/复杂键/非字符串形态键', () => {
  for (const bad of [
    'a: &x 1\nb: *x\n',
    'base: &b\n  k: 1\nsub:\n  <<: *b\n',
    'a: 1\n---\nb: 2\n',
    'a: !!str 1\n',
    '? complex\n: value\n',
    '1: a\n',
    'true: a\n',
  ]) {
    const r = parseYaml(bad);
    assert.equal(r.ok, false, bad);
    assert.equal(r.reason.kind, 'unsupported', bad);
    assert.ok(typeof r.reason.detail === 'string' && r.reason.detail.length > 0, bad);
  }
});

test('parseYaml 语法错带行列', () => {
  const r = parseYaml('a: 1\n  b: 2\n');
  assert.equal(r.ok, false);
  assert.equal(r.reason.kind, 'syntax');
  assert.equal(r.reason.line, 2);
});

test("parseYaml 引号标量:单引号 '' 转义、双引号反斜杠转义、与 plain 同值同构", () => {
  const a = parseYaml("a: 'it''s'\nb: \"x\\ty\"\nc: plain\n");
  assert.deepEqual(a.value.v.a, v('str', "it's"));
  assert.deepEqual(a.value.v.b, v('str', 'x\ty'));
  assert.deepEqual(a.value.v.c, v('str', 'plain'));
  assert.deepEqual(parseYaml('a: "1"\n').value.v.a, v('str', '1')); // quoted 不推断
});

test('parseYaml 块标量 |:字面保留换行,三态 chomping', () => {
  const clip = parseYaml('s: |\n  a\n  b\n');
  assert.deepEqual(clip.value.v.s, v('str', 'a\nb\n')); // clip:单尾换行
  const strip = parseYaml('s: |-\n  a\n  b\n');
  assert.deepEqual(strip.value.v.s, v('str', 'a\nb'));
  const keep = parseYaml('s: |+\n  a\n\n\n');
  assert.deepEqual(keep.value.v.s, v('str', 'a\n\n\n'));
});

test('parseYaml 块标量 >:折叠空格,空行成换行', () => {
  const r = parseYaml('s: >\n  a\n  b\n\n  c\n');
  assert.deepEqual(r.value.v.s, v('str', 'a b\nc\n'));
});

test('parseYaml plain 多行折叠:行并以空格', () => {
  const r = parseYaml('s: foo\n  bar\n');
  assert.deepEqual(r.value.v.s, v('str', 'foo bar'));
});

test('parseYaml flow 单行:序列/映射/嵌套/quoted 项', () => {
  const r = parseYaml('a: [1, two, "three"]\nb: {x: 1, y: [2, 3]}\nc: {k: v, "q k": 2}\n');
  assert.deepEqual(r.value.v.a, arr([v('int', 1), v('str', 'two'), v('str', 'three')]));
  assert.deepEqual(r.value.v.b, map({ x: v('int', 1), y: arr([v('int', 2), v('int', 3)]) }));
  assert.deepEqual(r.value.v.c, map({ k: v('str', 'v'), 'q k': v('int', 2) }));
  assert.equal(parseYaml('a: [1,\n 2]\n').ok, false); // 跨行 flow 拒
});

test('parseYaml 多行引号串拒(子集外)', () => {
  const r = parseYaml('s: "a\n  b"\n');
  assert.equal(r.ok, false);
  assert.equal(r.reason.kind, 'unsupported');
});

test('parseYaml 引号键:去引号为字符串键并豁免非字符串形态门;__proto__ 守卫看最终键串(裁定)', () => {
  // "on" 不再落字面引号键;"123" 收且为字符串键(plain 1 键仍拒);quoted __proto__ 仍拒
  const r = parseYaml('"on": 1\n"123": x\n');
  assert.deepEqual(r.value, map({ on: v('int', 1), '123': v('str', 'x') }));
  const bad = parseYaml('"__proto__": x\n');
  assert.equal(bad.ok, false);
  assert.equal(bad.reason.kind, 'unsupported');
});

test('parseYaml 块标量 EOF 无尾换行:clip/keep 不追加幻影换行,strip 不变(复审 D1)', () => {
  assert.deepEqual(parseYaml('s: |\n  a').value.v.s, v('str', 'a')); // oracle:'a'
  assert.deepEqual(parseYaml('s: |\n  a\n  b').value.v.s, v('str', 'a\nb'));
  assert.deepEqual(parseYaml('s: >\n  a\n  b').value.v.s, v('str', 'a b'));
  assert.deepEqual(parseYaml('s: |+\n  a').value.v.s, v('str', 'a'));
  assert.deepEqual(parseYaml('s: |-\n  a').value.v.s, v('str', 'a')); // strip 不受扰
  // 末行为浅空白行且无尾换行:内容行断行真实存在,其自身断行才是幻影(oracle:'a\n')
  assert.deepEqual(parseYaml('s: |+\n  a\n ').value.v.s, v('str', 'a\n'));
  // 有尾换行时深空白行于 EOF 是内容行,断行照算(oracle:'a\n \n')
  assert.deepEqual(parseYaml('s: |\n  a\n   \n').value.v.s, v('str', 'a\n \n'));
  assert.deepEqual(parseYaml('s: |+\n  a\n\n  b\n').value.v.s, v('str', 'a\n\nb\n')); // 复审标记探针
});

test('parseYaml 块标量深空白行:超出内容缩进的空格按字面保留(复审 D2)', () => {
  assert.deepEqual(parseYaml('s: |\n  a\n   \n  b\n').value.v.s, v('str', 'a\n \nb\n'));
  assert.deepEqual(parseYaml('s: >\n  a\n   \n  b\n  c\n').value.v.s, v('str', 'a\n \nb c\n'));
  // 等深空白行仍是空行;更浅空白行亦然(oracle:'a\n\nb\n')
  assert.deepEqual(parseYaml('s: |\n  a\n  \n  b\n').value.v.s, v('str', 'a\n\nb\n'));
  assert.deepEqual(parseYaml('s: |\n  a\n \n  b\n').value.v.s, v('str', 'a\n\nb\n'));
});

test('parseYaml flow 哨兵补全:锚点/别名/标签/复杂键于 flow 项/键/值位拒(复审 D3)', () => {
  for (const bad of [
    'a: [&x]\n', // oracle py=[null],非 '&x'
    'a: [*x]\n',
    'a: [!!str 1]\n', // oracle py=['1'],非 '!!str 1'
    'a: {!x}\n',
    'a: {? k : v}\n', // oracle py={k:'v'},键非 '? k'
    'a: {k: &v 1}\n', // 值位同哨兵(块路径 a: &x 1 既有行为对齐)
  ]) {
    const r = parseYaml(bad);
    assert.equal(r.ok, false, bad);
    assert.equal(r.reason.kind, 'unsupported', bad);
    assert.ok(r.reason.detail.length > 0, bad);
  }
});

test('parseYaml flow quoted 键后 JSON 形冒号:无空格紧随照收;plain 键规则不变(复审 D4)', () => {
  assert.deepEqual(parseYaml('a: {"x":1}\n').value, map({ a: map({ x: v('int', 1) }) }));
  assert.deepEqual(parseYaml('{"x":1}\n').value, map({ x: v('int', 1) })); // 根位
  assert.deepEqual(parseYaml('a: ["x":1]\n').value, map({ a: arr([map({ x: v('int', 1) })]) }));
  assert.deepEqual(parseYaml('a: {"x":1, "y":2}\n').value, map({ a: map({ x: v('int', 1), y: v('int', 2) }) }));
  // plain 键仍需空白/项尾:k:v 整体是键(oracle:{'k:v': null}),k:1 同
  assert.deepEqual(parseYaml('a: {k:v}\n').value, map({ a: map({ 'k:v': v('null') }) }));
  assert.deepEqual(parseYaml('a: [{k:1}]\n').value, map({ a: arr([map({ 'k:1': v('null') })]) }));
});

test('parseYaml 裁定 3 引号注释让路钉测:引号区 # 字面/闭引号后行尾注释(复审)', () => {
  assert.deepEqual(parseYaml('a: "x # y"\n').value, map({ a: v('str', 'x # y') }));
  assert.deepEqual(parseYaml('a: {k: "x # y"}\n').value, map({ a: map({ k: v('str', 'x # y') }) }));
  assert.deepEqual(parseYaml('a: ["x # y", z] # c\n').value, map({ a: arr([v('str', 'x # y'), v('str', 'z')]) }));
  assert.deepEqual(parseYaml('a: "x" # c\n').value, map({ a: v('str', 'x') }));
  assert.deepEqual(parseYaml("a: 'x' # don't\n").value, map({ a: v('str', 'x') }));
});

// 终审 rider:块上下文曾把 " k " 修剪成 k(flow 保真 ' k ')——同文两写法两键,值等价⇒文本等价
// 破坏(false-equal 方向)。quoted 键保真后两写法同键,规范形亦同文。
test('parseYaml quoted 键保真:块形不修剪,与 flow 同值同文(终审 rider)', () => {
  assert.deepEqual(parseYaml('" k ": 1\n').value, map({ ' k ': v('int', 1) }));
  assert.deepEqual(parseYaml('{" k ": 1}\n').value, map({ ' k ': v('int', 1) }));
  assert.equal(normalizeYaml('" k ": 1\n').text, normalizeYaml('{" k ": 1}\n').text); // 规范形收敛同文
});
