// tests/diff/yaml-parse.test.mjs — YAML 常用配置子集解析(wave-3 Task 1;标量细节与 flow 见后续任务)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from '../../src/tools/diff/shared/yaml-parse.js';

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

test('parseYaml 顶层:裸映射/裸序列/裸标量/空文档', () => {
  assert.deepEqual(parseYaml('k: v\n').value, map({ k: v('str', 'v') }));
  assert.deepEqual(parseYaml('- a\n').value, arr([v('str', 'a')]));
  assert.deepEqual(parseYaml('just a string\n').value, v('str', 'just a string'));
  assert.deepEqual(parseYaml('').value, v('null'));
  assert.deepEqual(parseYaml('---\nk: v\n...\n').value, map({ k: v('str', 'v') }));
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
