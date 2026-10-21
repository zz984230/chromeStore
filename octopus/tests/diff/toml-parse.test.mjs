// tests/diff/toml-parse.test.mjs — TOML 1.0 全谱解析(wave-2 Task 1;规范形见 norm-toml 测试)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToml } from '../../src/tools/diff/shared/toml-parse.js';

const val = (t, v) => ({ t, v });
const tbl = (o) => ({ t: 'tbl', v: o });
const arr = (v) => ({ t: 'arr', v });

test('parseToml 标量四类:int 四进制与下划进十进制', () => {
  const r = parseToml('a = 255\nb = 0xff\nc = 0o377\nd = 0b11111111\ne = 1_000\nf = -17\n');
  assert.deepEqual(r.value.v, {
    a: val('int', 255), b: val('int', 255), c: val('int', 255),
    d: val('int', 255), e: val('int', 1000), f: val('int', -17),
  });
});

test('parseToml float:小数/指数/inf/nan', () => {
  const r = parseToml('a = 3.14\nb = 1e2\nc = -2E-2\nd = inf\ne = -inf\nf = nan\n');
  assert.equal(r.value.v.a.v, 3.14);
  assert.equal(r.value.v.b.v, 100);
  assert.equal(r.value.v.c.v, -0.02);
  assert.equal(r.value.v.d.v, Infinity);
  assert.equal(r.value.v.e.v, -Infinity);
  assert.ok(Number.isNaN(r.value.v.f.v));
});

test('parseToml 布尔与字符串四式同值', () => {
  const r = parseToml('a = true\nb = "x"\nc = \'x\'\nd = """x"""\ne = \'\'\'x\'\'\'\n');
  assert.equal(r.value.v.a.v, true);
  for (const k of ['b', 'c', 'd', 'e']) assert.deepEqual(r.value.v[k], val('str', 'x'));
});

test('parseToml 转义与多行串:首换行裁剪、行尾反斜杠去空白', () => {
  const r = parseToml('a = "A\\tB"\nb = """\nx\\\n  y"""\nc = "\\u00e9"\n');
  assert.deepEqual(r.value.v.a, val('str', 'A\tB'));
  assert.deepEqual(r.value.v.b, val('str', 'xy'));
  assert.deepEqual(r.value.v.c, val('str', 'é'));
});

test('parseToml 日期时间四型:odt 归 UTC Z,t/z 归大写,分数尾零未修(发射层修)', () => {
  const r = parseToml('a = 1979-05-27T07:32:00Z\nb = 1979-05-27t00:32:00+07:30\nc = 1979-05-27 07:32:00\n'
    + 'd = 1979-05-27\ne = 07:32:00\nf = 07:32:00.999\n');
  assert.equal(r.value.v.a.v, '1979-05-27T07:32:00Z');
  assert.equal(r.value.v.b.v, '1979-05-26T17:02:00Z');
  assert.deepEqual(r.value.v.c, val('ldt', '1979-05-27T07:32:00'));
  assert.deepEqual(r.value.v.d, val('ld', '1979-05-27'));
  assert.deepEqual(r.value.v.e, val('lt', '07:32:00'));
  assert.deepEqual(r.value.v.f, val('lt', '07:32:00.999'));
});

test('parseToml 表/点键/内联表/数组:同值同构', () => {
  const a = parseToml('[t]\nx = 1\n');
  const b = parseToml('t.x = 1\n');
  const c = parseToml('t = {x = 1}\n');
  assert.deepEqual(a.value, b.value);
  assert.deepEqual(b.value, c.value);
  const d = parseToml('[a.b]\nk = 1\n[a]\nn = 2\n');
  assert.deepEqual(d.value.v.a.v, { b: tbl({ k: val('int', 1) }), n: val('int', 2) });
  const e = parseToml('arr = [1, 2, 3]\nmulti = [\n  1,\n  2,\n  3, # 注释\n]\n');
  assert.deepEqual(e.value.v.arr, arr([val('int', 1), val('int', 2), val('int', 3)]));
  assert.deepEqual(e.value.v.multi, e.value.v.arr);
});

test('parseToml 数组表:追加保序', () => {
  const r = parseToml('[[pt]]\nx = 1\n[[pt]]\nx = 2\n');
  assert.deepEqual(r.value.v.pt, arr([tbl({ x: val('int', 1) }), tbl({ x: val('int', 2) })]));
});

test('parseToml 碰撞规则:重复表/标量占位/点键后再定义/重键/内联扩展', () => {
  for (const bad of [
    '[a]\nx=1\n[a]\ny=2\n',
    'a = 1\n[a]\n',
    'a.b = 1\n[a]\n',
    'a = 1\na = 2\n',
    'a = {x = 1}\n[a.b]\n',
  ]) {
    const r = parseToml(bad);
    assert.equal(r.ok, false, bad);
    assert.equal(r.reason.kind, 'syntax', bad);
  }
});

test('parseToml 语法错带行列', () => {
  const r = parseToml('x = 1\ny = "未闭合\n');
  assert.equal(r.ok, false);
  assert.equal(r.reason.kind, 'syntax');
  assert.equal(r.reason.line, 2);
  assert.ok(r.reason.col >= 5);
  const z = parseToml('x = 0123\n');
  assert.equal(z.ok, false); // 前导零整数非法
});

test('parseToml 数组表下钻:表头路径穿数组表挂最后元素(规范惯用法)', () => {
  const a = parseToml('[[fruit]]\nname = "apple"\n\n[fruit.physical]\ncolor = "red"\n');
  assert.deepEqual(a.value.v.fruit, arr([
    tbl({ name: val('str', 'apple'), physical: tbl({ color: val('str', 'red') }) }),
  ]));
  // 双元素:子表挂最后定义的元素,不污染前者
  const b = parseToml('[[fruit]]\nname = "apple"\n\n[[fruit]]\nname = "banana"\n\n[fruit.physical]\ncolor = "yellow"\n');
  assert.deepEqual(b.value.v.fruit, arr([
    tbl({ name: val('str', 'apple') }),
    tbl({ name: val('str', 'banana'), physical: tbl({ color: val('str', 'yellow') }) }),
  ]));
  // 点键值路径不穿数组表:同名键在当前表内新嵌套(对齐 tomllib);前缀撞到数组表则按标量占位拒
  const c = parseToml('[[fruit]]\nfruit.physical.color = "red"\n');
  assert.deepEqual(c.value.v.fruit, arr([tbl({ fruit: tbl({ physical: tbl({ color: val('str', 'red') }) }) })]));
  const d = parseToml('[[fruit.physical]]\ncolor = "red"\n\n[fruit]\n\nphysical.shape = "round"\n');
  assert.equal(d.ok, false);
  assert.equal(d.reason.kind, 'syntax');
});

test('parseToml 内联表闭合:[a] 表头同样拒并', () => {
  const r = parseToml('a = {x = 1}\n[a]\ny = 2\n');
  assert.equal(r.ok, false);
  assert.equal(r.reason.kind, 'syntax');
  assert.ok(r.reason.detail.includes('内联表'), r.reason.detail);
});

test('parseToml CRLF 全谱:行尾等价 LF、多行串归一 \\n、裸 \\r 仍拒', () => {
  const lf = parseToml('a = 1\n[t]\nb = "x"\n');
  const crlf = parseToml('a = 1\r\n[t]\r\nb = "x"\r\n');
  assert.deepEqual(crlf.value, lf.value);
  const m = parseToml('x = """\r\nline1\r\nline2"""\r\ny = \'\'\'\r\nraw1\r\nraw2\'\'\'\r\n');
  assert.deepEqual(m.value.v.x, val('str', 'line1\nline2'));
  assert.deepEqual(m.value.v.y, val('str', 'raw1\nraw2'));
  const cr = parseToml('a = 1\rb = 2\n');
  assert.equal(cr.ok, false);
  assert.equal(cr.reason.kind, 'syntax');
});

test('parseToml 注释丢弃、键引号与裸键同名同值、空表保形', () => {
  const a = parseToml('# 头注释\n"a-b" = 1\n');
  const b = parseToml('a-b = 1 # 尾注释\n');
  assert.deepEqual(a.value, b.value);
  const e = parseToml('[empty]\n');
  assert.deepEqual(e.value.v.empty, tbl({}));
});
