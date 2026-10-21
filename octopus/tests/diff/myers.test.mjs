// tests/diff/myers.test.mjs — Myers 引擎与行语义(ADR-0004)
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLines, joinLines } from '../../src/tools/diff/shared/lines.js';
import { diffLines, degradedLines, diffChars, diffSeq } from '../../src/tools/diff/shared/myers.js';

test('splitLines/joinLines 行语义:空文本=零行,结尾换行=一个空行', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines('a'), ['a']);
  assert.deepEqual(splitLines('a\n'), ['a', '']);
  assert.deepEqual(splitLines('a\nb'), ['a', 'b']);
  assert.equal(joinLines([]), '');
  assert.equal(joinLines(['a', '']), 'a\n');
  assert.equal(joinLines(splitLines('a\nb\nc')), 'a\nb\nc');
});

test('diffLines 全同:全等操作序,行号双栏对齐', () => {
  const ops = diffLines('a\nb', 'a\nb');
  assert.deepEqual(ops, [
    { t: '=', text: 'a', aLn: 1, bLn: 1 },
    { t: '=', text: 'b', aLn: 2, bLn: 2 },
  ]);
});

test('diffLines 空对空:零操作', () => {
  assert.deepEqual(diffLines('', ''), []);
});

test('diffLines 纯新增:插入行带右栏行号,左栏行号留空', () => {
  const ops = diffLines('a\nc', 'a\nb\nc');
  assert.deepEqual(ops, [
    { t: '=', text: 'a', aLn: 1, bLn: 1 },
    { t: '+', text: 'b', bLn: 2 },
    { t: '=', text: 'c', aLn: 2, bLn: 3 },
  ]);
});

test('diffLines 纯删除与替换', () => {
  assert.deepEqual(diffLines('a\nb\nc', 'a\nc'), [
    { t: '=', text: 'a', aLn: 1, bLn: 1 },
    { t: '-', text: 'b', aLn: 2 },
    { t: '=', text: 'c', aLn: 3, bLn: 2 },
  ]);
  const rep = diffLines('a\nX\nc', 'a\nY\nc');
  assert.deepEqual(rep.map((o) => o.t), ['=', '-', '+', '=']);
});

test('diffLines 结尾换行差异是一个真实差异行', () => {
  assert.deepEqual(diffLines('a', 'a\n'), [
    { t: '=', text: 'a', aLn: 1, bLn: 1 },
    { t: '+', text: '', bLn: 2 },
  ]);
});

test('diffLines D 超限返回 null(降级信号)', () => {
  assert.equal(diffLines('x\ny', 'p\nq', { dCap: 1 }), null);
  // 同输入不设限则正常精算
  assert.notEqual(diffLines('x\ny', 'p\nq'), null);
});

test('degradedLines 降级形:公共首尾保留,中间整块 -/+', () => {
  const ops = degradedLines('h\nx\ny\nt', 'h\np\nq\nt');
  assert.deepEqual(ops, [
    { t: '=', text: 'h', aLn: 1, bLn: 1 },
    { t: '-', text: 'x', aLn: 2 },
    { t: '-', text: 'y', aLn: 3 },
    { t: '+', text: 'p', bLn: 2 },
    { t: '+', text: 'q', bLn: 3 },
    { t: '=', text: 't', aLn: 4, bLn: 4 },
  ]);
});

test('大输入冒烟:2000 行改 50 行在 2000 次操作内出全等序', () => {
  const a = Array.from({ length: 2000 }, (_, i) => `line-${i}`);
  const b = [...a];
  for (let i = 0; i < 50; i++) b[i * 40] = `changed-${i}`;
  const ops = diffLines(a.join('\n'), b.join('\n'));
  const eq = ops.filter((o) => o.t === '=').length;
  assert.equal(eq, 1950);
  assert.equal(ops.filter((o) => o.t === '-').length, 50);
  assert.equal(ops.filter((o) => o.t === '+').length, 50);
});

// —— M3.5:序列核心与字符级适配(ADR-0006) ——

test('diffSeq 序列核心:吃任意数组,索引三元组形状', () => {
  assert.deepEqual(diffSeq(['a', 'b'], ['a', 'c'], Infinity), [
    { t: '=', x: 0, y: 0 },
    { t: '-', x: 1 },
    { t: '+', y: 1 },
  ]);
});

test('diffChars 段式输出:公共前后缀并入等值段,相邻同侧合并', () => {
  assert.deepEqual(diffChars('abc', 'abd'), [
    { t: '=', text: 'ab' },
    { t: '-', text: 'c' },
    { t: '+', text: 'd' },
  ]);
  assert.deepEqual(diffChars('', 'xyz'), [{ t: '+', text: 'xyz' }]);
  assert.deepEqual(diffChars('xyzabc', 'uvwabc'), [
    { t: '-', text: 'xyz' },
    { t: '+', text: 'uvw' },
    { t: '=', text: 'abc' },
  ]);
});

test('diffChars 码点切分:emoji 原子不拆代理对', () => {
  assert.deepEqual(diffChars('a😀b', 'a🎉b'), [
    { t: '=', text: 'a' },
    { t: '-', text: '😀' },
    { t: '+', text: '🎉' },
    { t: '=', text: 'b' },
  ]);
});

test('diffChars D 超限返回 null(字符级降级信号)', () => {
  assert.equal(diffChars('abcdefgh', 'ABCDEFGH', { dCap: 3 }), null);
  assert.notEqual(diffChars('abcdefgh', 'ABCDEFGH'), null);
});

test('diffChars 随机 500 对:段重放还原双串且段已合并', () => {
  for (let t = 0; t < 500; t++) {
    const A = Array.from({ length: 1 + (t * 7) % 30 }, (_, i) => 'abcdefghij'[(i * 7 + t) % 10]).join('');
    const B = Array.from({ length: 1 + (t * 5) % 30 }, (_, i) => 'abcdefghij'[(i * 3 + t * 2) % 10]).join('');
    const segs = diffChars(A, B);
    if (segs === null) continue;
    assert.equal(segs.filter((s) => s.t !== '+').map((s) => s.text).join(''), A);
    assert.equal(segs.filter((s) => s.t !== '-').map((s) => s.text).join(''), B);
    for (let i = 1; i < segs.length; i++) assert.notEqual(segs[i].t, segs[i - 1].t);
  }
});
