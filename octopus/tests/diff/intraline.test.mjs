// tests/diff/intraline.test.mjs — 配对行字符级高亮(ADR-0006;CONTEXT.md「配对行」「字符级高亮」)
import test from 'node:test';
import assert from 'node:assert/strict';
import { intralinePair, intralineChunk } from '../../src/tools/diff/shared/intraline.js';

test('intralinePair 基本段:差异字符 hot,公共部分冷', () => {
  assert.deepEqual(intralinePair('abc', 'abd'), {
    del: [{ hot: false, text: 'ab' }, { hot: true, text: 'c' }],
    add: [{ hot: false, text: 'ab' }, { hot: true, text: 'd' }],
  });
});

test('intralinePair 全同行:单段全冷', () => {
  assert.deepEqual(intralinePair('same', 'same'), {
    del: [{ hot: false, text: 'same' }],
    add: [{ hot: false, text: 'same' }],
  });
});

test('intralinePair charMax:超限返回 null,等于不超', () => {
  assert.equal(intralinePair('aaaaa', 'bbbbb', { charMax: 4 }), null);
  assert.deepEqual(intralinePair('aaa', 'bbb', { charMax: 3 }), {
    del: [{ hot: true, text: 'aaa' }],
    add: [{ hot: true, text: 'bbb' }],
  });
});

test('intralinePair dCap 超限返回 null(静默降级)', () => {
  assert.equal(intralinePair('abcdef', 'ABCDEF', { dCap: 2 }), null);
});

test('intralineChunk 按位配对:第 i 删配第 i 增,落单行 null', () => {
  const chunk = {
    kind: '!',
    del: [{ text: 'X1' }, { text: 'X2' }],
    add: [{ text: 'Y1' }],
  };
  const hl = intralineChunk(chunk);
  assert.equal(hl.del.length, 2);
  assert.equal(hl.add.length, 1);
  assert.deepEqual(hl.del[0], [{ hot: true, text: 'X' }, { hot: false, text: '1' }]);
  assert.deepEqual(hl.add[0], [{ hot: true, text: 'Y' }, { hot: false, text: '1' }]);
  assert.equal(hl.del[1], null);
});

test('intralineChunk 预算尽:超预算的配对整对 null', () => {
  const chunk = {
    kind: '!',
    del: [{ text: 'aaaa' }, { text: 'bbbb' }],
    add: [{ text: 'cccc' }, { text: 'dddd' }],
  };
  const hl = intralineChunk(chunk, { chunkBudget: 10 });
  assert.ok(Array.isArray(hl.del[0]));
  assert.ok(Array.isArray(hl.add[0]));
  assert.equal(hl.del[1], null);
  assert.equal(hl.add[1], null);
});

test('intralineChunk 单侧块:n=0,两侧全 null 数组', () => {
  const hl = intralineChunk({ kind: '!', del: [], add: [{ text: 'x' }] });
  assert.deepEqual(hl.del, []);
  assert.equal(hl.add.length, 1);
  assert.equal(hl.add[0], null);
});

test('intralineChunk 预算恰好归零:末对仍计算,再负才停', () => {
  const chunk = {
    kind: '!',
    del: [{ text: 'aa' }, { text: 'bb' }, { text: 'ee' }],
    add: [{ text: 'cc' }, { text: 'dd' }, { text: 'ff' }],
  };
  const hl = intralineChunk(chunk, { chunkBudget: 8 }); // 8-4-4=0,恰归零不弃
  assert.ok(Array.isArray(hl.del[1]));
  assert.ok(Array.isArray(hl.add[1]));
  assert.equal(hl.del[2], null); // 0-4<0,弃
});
