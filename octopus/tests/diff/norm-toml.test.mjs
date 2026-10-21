// tests/diff/norm-toml.test.mjs — TOML 规范形(wave-2 Task 2;ADR-0007 值等价⇒文本等价/幂等)
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToml } from '../../src/tools/diff/shared/norm-toml.js';

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
  assert.ok(m.text.includes('"""\n') || m.text.includes('"""x\ny'), m.text);
  assert.ok(m.text.includes('y\n"""'), m.text);
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
