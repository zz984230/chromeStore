// tests/diff/norm-toml.test.mjs — TOML 规范形(wave-2 Task 3;ADR-0007 值等价⇒文本等价/幂等)
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToml } from '../../src/tools/diff/shared/norm-toml.js';
import { parseToml } from '../../src/tools/diff/shared/toml-parse.js';

const val = (t, v) => ({ t, v });
const tbl = (o) => ({ t: 'tbl', v: o });
const arr = (v) => ({ t: 'arr', v });

test('normalizeToml 点键/内联表/引号/进制/时区全收敛为同一文本', () => {
  const a = normalizeToml('[t]\nx = 0xff\n');
  const b = normalizeToml('t = { x = 255 }\n');
  const c = normalizeToml('t.x = 255\n');
  assert.equal(a.ok, true);
  assert.equal(a.text, b.text);
  assert.equal(b.text, c.text);
});

test('normalizeToml 规范形样张:键排序、标量先于子表、数组恒多行、表体不缩进', () => {
  const r = normalizeToml('b = 2\na = 1\n[t2]\ny = [1, 2]\n[t1]\nx = 1\n');
  assert.equal(r.text, 'a = 1\nb = 2\n\n[t1]\nx = 1\n\n[t2]\ny = [\n  1,\n  2,\n]\n');
});

test('normalizeToml 字符串收敛基本串:单行转义、多行三引号、字面串同值同文本', () => {
  const a = normalizeToml("a = 'x'\nb = \"\"\"x\"\"\"\nc = '''x'''\n");
  const b = normalizeToml('a = "x"\nb = "x"\nc = "x"\n');
  assert.equal(a.text, b.text);
  const m = normalizeToml('s = """x\ny"""\n');
  assert.ok(m.text.includes('"""\nx\ny"""'), m.text);
});

test('normalizeToml 多行串载体式值保真:五样张发射前后值严格相等且幂等', () => {
  for (const doc of ['s = """x"""', 's = """x\n"""', 's = """\nx"""', 's = """x\ny"""', 's = """x\ny\n"""']) {
    const before = parseToml(doc + '\n');
    assert.equal(before.ok, true);
    const n = normalizeToml(doc + '\n');
    assert.equal(n.ok, true);
    const after = parseToml(n.text);
    assert.equal(after.ok, true);
    assert.deepEqual(after.value.v.s, before.value.v.s, doc);
    const twice = normalizeToml(n.text);
    assert.equal(twice.ok, true);
    assert.equal(twice.text, n.text, doc);
  }
});

test('normalizeToml 混合数组表元素内联发射:多行数组体、幂等、值保真(tomllib 同形)', () => {
  const r = normalizeToml('a = [{x = 1}, 2]\n');
  assert.equal(r.ok, true);
  assert.equal(r.text, 'a = [\n  {x = 1},\n  2,\n]\n');
  const twice = normalizeToml(r.text);
  assert.equal(twice.text, r.text);
  const back = parseToml(r.text);
  assert.deepEqual(back.value.v.a, arr([tbl({ x: val('int', 1) }), val('int', 2)]));
});

test('normalizeToml 内联上下文强制单行:嵌套数组含表往返、元素内联表不换行', () => {
  const z = normalizeToml('z = [[{x = 1}]]\n');
  assert.equal(z.ok, true);
  assert.equal(z.text, 'z = [\n  [\n    {x = 1},\n  ],\n]\n');
  assert.equal(normalizeToml(z.text).text, z.text);
  assert.deepEqual(parseToml(z.text).value.v.z, arr([arr([tbl({ x: val('int', 1) })])]));
  // 纯表数组在键位仍走 [[..]] 节形(isSection 路由不动),单行强制经混合数组元素验证:
  const v = normalizeToml('v = [{a = [1, 2], s = "l\\nm"}, 0]\n');
  assert.equal(v.text, 'v = [\n  {a = [1, 2], s = "l\\nm"},\n  0,\n]\n');
  assert.equal(normalizeToml(v.text).text, v.text);
  assert.deepEqual(parseToml(v.text).value.v.v, arr([
    tbl({ a: arr([val('int', 1), val('int', 2)]), s: val('str', 'l\nm') }), val('int', 0),
  ]));
});

test('normalizeToml 日期时间:偏移归 Z、小写归大写、分数尾零修剪', () => {
  const r = normalizeToml('a = 1979-05-27T07:32:00.000Z\nb = 1979-05-27t00:32:00+07:30\n');
  assert.ok(r.text.includes('a = 1979-05-27T07:32:00Z\n'), r.text);
  assert.ok(r.text.includes('b = 1979-05-26T17:02:00Z\n'), r.text);
});

test('normalizeToml 数组表保序、嵌套数组 +2 空格、空表保形、注释丢弃', () => {
  const r = normalizeToml('# c\n[[pt]]\nx = 1\n[[pt]]\nx = 2\n[e]\n[n]\nz = [[1], [2]]\n');
  assert.ok(r.text.indexOf('[[pt]]\nx = 1') < r.text.indexOf('[[pt]]\nx = 2'), r.text);
  assert.ok(r.text.includes('[e]\n\n[n]'), r.text);
  assert.ok(r.text.includes('z = [\n  [\n    1,\n  ],\n  [\n    2,\n  ],\n]'), r.text);
});

test('normalizeToml 裸键字符集外发引号键,引号键与裸键同值同文本', () => {
  const a = normalizeToml('"a b" = 1\n');
  const b = normalizeToml("'a b' = 1\n");
  assert.equal(a.text, b.text);
  assert.ok(a.text.includes('"a b" = 1'), a.text);
  assert.ok(normalizeToml('a-b_1 = 1\n').text.includes('a-b_1 = 1'));
});

test('normalizeToml 幂等:对规范形再归一化不变', () => {
  const once = normalizeToml('t = { x = 0xff, s = """a\nb""", d = 1979-05-27T00:32:00+07:30 }\n');
  const twice = normalizeToml(once.text);
  assert.equal(twice.ok, true);
  assert.equal(twice.text, once.text);
});

test('normalizeToml 语法错直通解析器(reason 契约)', () => {
  const r = normalizeToml('x = "未闭合\n');
  assert.equal(r.ok, false);
  assert.equal(r.reason.kind, 'syntax');
  assert.equal(r.reason.line, 1);
});
