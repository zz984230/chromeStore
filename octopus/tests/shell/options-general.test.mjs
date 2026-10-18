// tests/shell/options-general.test.mjs — 导入白名单与逐键卫生(纯函数)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportFile, EXPORT_KEYS } from '../../src/shell/options-general.js';

const wrap = (data) => JSON.stringify({ app: 'octopus', exportedAt: '2026-10-18T00:00:00Z', data });

test('合法导入:已知键全收,未知键丢弃', () => {
  const out = parseImportFile(wrap({ 'nightveil.settings': { state: 'dark' }, 'vpa.settings': { pace: 2 }, 'oct.shell': { activeTool: 'veil' }, evil: { x: 1 } }));
  assert.deepEqual(out['nightveil.settings'], { state: 'dark' });
  assert.equal(out['vpa.settings'].pace, 2);
  assert.deepEqual(out['oct.shell'], { activeTool: 'veil' });
  assert.equal('evil' in out, false);
});

test('结构性拒收一律 null:坏 JSON / 非 octopus / data 非对象 / 键值非对象', () => {
  assert.equal(parseImportFile('{oops'), null);
  assert.equal(parseImportFile(JSON.stringify({ app: 'other', data: {} })), null);
  assert.equal(parseImportFile(JSON.stringify({ app: 'octopus', data: [1] })), null);
  assert.equal(parseImportFile(wrap({ 'vpa.settings': 'nope' })), null);
});

test('空导出再导入:合法包无已知键 → {}(调用方据此提示「没有可导入的数据」)', () => {
  assert.deepEqual(parseImportFile(wrap({})), {});
});

test('vpa 数值脏(字符串数/null/越界片秒)→ 丢 vpa 键,其余键保留', () => {
  const keep = { 'oct.shell': { activeWing: 'pace' } };
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { pace: 'fast', hold: true }, ...keep })), keep);
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { introSkip: null }, ...keep })), keep);
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { outroSkip: -5 }, ...keep })), keep);
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { introSkip: 9999 }, ...keep })), keep);
});

test('vpa 布尔脏 → 丢 vpa 键', () => {
  assert.deepEqual(parseImportFile(wrap({ 'vpa.settings': { hold: 'yes' }, 'oct.shell': { activeWing: 'pace' } })), { 'oct.shell': { activeWing: 'pace' } });
});

test('vpa 档位越界经 clampPace 夹取:99→16、0.001→0.07', () => {
  const out = parseImportFile(wrap({ 'vpa.settings': { pace: 99, heldPace: 0.001 } }));
  assert.equal(out['vpa.settings'].pace, 16);
  assert.equal(out['vpa.settings'].heldPace, 0.07);
});

test('oct.shell 值脏:activeWing 不在翼集 → 丢键;合法值原样保留', () => {
  assert.deepEqual(parseImportFile(wrap({ 'oct.shell': { activeWing: 'evil' }, 'vpa.settings': { pace: 2 } })), { 'vpa.settings': { pace: 2 } });
  assert.deepEqual(parseImportFile(wrap({ 'oct.shell': { activeTool: 'pace', activeWing: 'gen' } }))['oct.shell'], { activeTool: 'pace', activeWing: 'gen' });
});

test('导出键白名单恰为三键', () => {
  assert.deepEqual([...EXPORT_KEYS].sort(), ['nightveil.settings', 'oct.shell', 'vpa.settings']);
});
