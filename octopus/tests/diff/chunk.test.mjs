// tests/diff/chunk.test.mjs — 差异块切分与块级合并(CONTEXT.md「差异块」;裁定:块级整块采纳)
import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines } from '../../src/tools/diff/shared/myers.js';
import { toChunks } from '../../src/tools/diff/shared/chunker.js';
import { applyChunk } from '../../src/tools/diff/shared/merge.js';

const opsOf = (a, b) => diffLines(a, b);

test('toChunks:等值段与差异块交替,顺序保真', () => {
  const chunks = toChunks(opsOf('a\nX\nb\nY\nc', 'a\nx\nb\ny\nc'));
  assert.deepEqual(chunks.map((c) => c.kind), ['=', '!', '=', '!', '=']);
  assert.equal(chunks[0].lines.length, 1);
  assert.equal(chunks[1].del.length, 1);
  assert.equal(chunks[1].add.length, 1);
});

test('toChunks:单行块与多行交替块,首尾可为差异块', () => {
  assert.deepEqual(toChunks(opsOf('a', 'b')).map((c) => c.kind), ['!']);
  const chunks = toChunks(opsOf('X\na', 'p\nq\na'));
  assert.deepEqual(chunks.map((c) => c.kind), ['!', '=']);
  assert.equal(chunks[0].del.length, 1);
  assert.equal(chunks[0].add.length, 2);
});

test('toChunks:全等输入只有一个等值段;空输入零段', () => {
  assert.deepEqual(toChunks(opsOf('a\nb', 'a\nb')).map((c) => c.kind), ['=']);
  assert.deepEqual(toChunks([]), []);
});

test('applyChunk 替换块以左为准:两栏该块一致,其余块原样', () => {
  const chunks = toChunks(opsOf('a\nX1\nX2\nc', 'a\nY\nc'));
  const i = chunks.findIndex((c) => c.kind === '!');
  const merged = applyChunk(chunks, i, 'left');
  assert.deepEqual(merged, { left: 'a\nX1\nX2\nc', right: 'a\nX1\nX2\nc' });
});

test('applyChunk 替换块以右为准', () => {
  const chunks = toChunks(opsOf('a\nX\nc', 'a\nY\nc'));
  const i = chunks.findIndex((c) => c.kind === '!');
  assert.deepEqual(applyChunk(chunks, i, 'right'), { left: 'a\nY\nc', right: 'a\nY\nc' });
});

test('applyChunk 纯插入块:以左为准=右栏删行;以右为准=左栏补行', () => {
  const chunks = toChunks(opsOf('a\nc', 'a\nb\nc'));
  const i = chunks.findIndex((c) => c.kind === '!');
  assert.deepEqual(applyChunk(chunks, i, 'left'), { left: 'a\nc', right: 'a\nc' });
  assert.deepEqual(applyChunk(chunks, i, 'right'), { left: 'a\nb\nc', right: 'a\nb\nc' });
});

test('applyChunk 多块只动目标块', () => {
  const chunks = toChunks(opsOf('A\nm\nB', 'a\nm\nb'));
  const is = chunks.map((c, i) => c.kind === '!' ? i : -1).filter((i) => i >= 0);
  const merged = applyChunk(chunks, is[0], 'right');
  assert.deepEqual(merged, { left: 'a\nm\nB', right: 'a\nm\nb' });
});

test('applyChunk 结尾换行行参与合并;坏索引/非差异块返回 null', () => {
  const chunks = toChunks(opsOf('a', 'a\n'));
  const i = chunks.findIndex((c) => c.kind === '!');
  assert.deepEqual(applyChunk(chunks, i, 'left'), { left: 'a', right: 'a' });
  assert.equal(applyChunk(chunks, i, 'up'), null);
  assert.equal(applyChunk(chunks, 99, 'left'), null);
  assert.equal(applyChunk(chunks, 0, 'left'), null); // chunk 0 是等值段
});
