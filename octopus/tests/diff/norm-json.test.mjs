// tests/diff/norm-json.test.mjs — JSON 归一化器(ADR-0007:值等价⇒文本等价/幂等)
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJson } from '../../src/tools/diff/shared/norm-json.js';

test('normalizeJson 规范形:键码点排序,嵌套缩进 2,文末一换行', () => {
  assert.equal(normalizeJson('{"b":1,"a":{"d":true,"c":null}}').text,
    '{\n  "a": {\n    "c": null,\n    "d": true\n  },\n  "b": 1\n}\n');
});

test('normalizeJson 值等价收敛:1e2/1.0/1 与空格差异同文本', () => {
  const a = normalizeJson('{"a":100,"b":1.0}');
  const b = normalizeJson('{ "a" : 1e2 , "b" : 1 }');
  assert.equal(a.ok, true);
  assert.equal(a.text, b.text);
});

test('normalizeJson 幂等:对规范形再归一化不变', () => {
  const once = normalizeJson('{"z":[1,{"y":2}],"x":3}');
  const twice = normalizeJson(once.text);
  assert.equal(twice.ok, true);
  assert.equal(twice.text, once.text);
});

test('normalizeJson 数组保序:不排序数组元素', () => {
  assert.equal(normalizeJson('[3,1,2]').text, '[\n  3,\n  1,\n  2\n]\n');
});

test('normalizeJson 码点序:增补面键排在 BMP 全宽字符之后', () => {
  const bmp = 'ａ'; // U+FF41
  const sup = '😀'; // U+1F600 代理对;默认 sort 按码元会把它排到 U+FF41 之前,码点序在其后
  const r = normalizeJson(`{"${sup}":1,"${bmp}":2}`);
  assert.ok(r.text.indexOf(`"${bmp}"`) < r.text.indexOf(`"${sup}"`));
});

test('normalizeJson 空输入:语法错拒绝,reason 结构完整', () => {
  const r = normalizeJson('');
  assert.equal(r.ok, false);
  assert.equal(r.reason.kind, 'syntax');
  assert.ok(typeof r.reason.detail === 'string' && r.reason.detail.length > 0);
});

test('normalizeJson 语法错行列:按本机 V8 实测格式如实呈现', () => {
  const r = normalizeJson('{"a":1}\n{');
  assert.equal(r.ok, false);
  assert.equal(r.reason.kind, 'syntax');
  assert.equal(r.reason.line, 2);
  assert.ok(r.reason.col >= 1);
});
