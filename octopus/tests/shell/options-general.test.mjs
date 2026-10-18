// tests/shell/options-general.test.mjs — 导入白名单纯函数
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportFile, EXPORT_KEYS } from '../../src/shell/options-general.js';

const wrap = (data) => JSON.stringify({ app: 'octopus', exportedAt: '2026-10-18T00:00:00Z', data });

test('合法导入:已知键全收,未知键丢弃', () => {
  const out = parseImportFile(wrap({ 'nightveil.settings': { state: 'dark' }, 'vpa.settings': { pace: 2 }, 'oct.shell': { activeTool: 'veil' }, evil: { x: 1 } }));
  assert.deepEqual(Object.keys(out).sort(), ['nightveil.settings', 'oct.shell', 'vpa.settings']);
});

test('非法导入一律 null:坏 JSON / 非 octopus / data 非对象 / 值非对象 / 无已知键', () => {
  assert.equal(parseImportFile('{oops'), null);
  assert.equal(parseImportFile(JSON.stringify({ app: 'other', data: {} })), null);
  assert.equal(parseImportFile(JSON.stringify({ app: 'octopus', data: [1] })), null);
  assert.equal(parseImportFile(wrap({ 'vpa.settings': 'nope' })), null);
  assert.equal(parseImportFile(wrap({})), null);
});

test('导出键白名单恰为三键', () => {
  assert.deepEqual([...EXPORT_KEYS].sort(), ['nightveil.settings', 'oct.shell', 'vpa.settings']);
});
