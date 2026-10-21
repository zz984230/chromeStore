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

test('parseToml 注释丢弃、键引号与裸键同名同值、空表保形', () => {
  const a = parseToml('# 头注释\n"a-b" = 1\n');
  const b = parseToml('a-b = 1 # 尾注释\n');
  assert.deepEqual(a.value, b.value);
  const e = parseToml('[empty]\n');
  assert.deepEqual(e.value.v.empty, tbl({}));
});
