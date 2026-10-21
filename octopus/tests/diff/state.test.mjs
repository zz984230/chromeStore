// tests/diff/state.test.mjs — 撤销栈快照语义 + sessionStorage 兜底(裁定 5/7;注入式 store)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_LIMIT, SESSION_KEYS, nextHistory, undoFrom, redoFrom, saveSession, loadSession,
} from '../../src/tools/diff/page/state.js';

const h0 = { undo: [], redo: [] };
const s1 = { left: 'a1', right: 'b1' };
const s2 = { left: 'a2', right: 'b2' };

test('nextHistory 压栈并清空 redo', () => {
  let h = nextHistory(nextHistory(h0, s1), s2);
  assert.deepEqual(h, { undo: [s1, s2], redo: [] });
  h = nextHistory(h, { left: 'a3', right: 'b3' });
  assert.equal(h.undo.length, 3);
});

test('undoFrom/redoFrom 往返还原,空栈返回 null', () => {
  assert.equal(undoFrom(s1, h0), null);
  assert.equal(redoFrom(s1, h0), null);
  let h = nextHistory(h0, s1); // 当前 s2,栈里 s1
  const u = undoFrom(s2, h);
  assert.deepEqual(u.texts, s1);
  assert.deepEqual(u.hist, { undo: [], redo: [s2] });
  const r = redoFrom(u.texts, u.hist);
  assert.deepEqual(r.texts, s2);
  assert.deepEqual(r.hist, { undo: [s1], redo: [] });
});

test('新合并清空 redo(分支丢弃)', () => {
  let h = nextHistory(h0, s1);
  const u = undoFrom(s2, h);
  h = nextHistory(u.hist, { left: 'a9', right: 'b9' });
  assert.deepEqual(h.redo, []);
});

test('撤销栈容量 HISTORY_LIMIT=100,滑窗丢弃最旧', () => {
  let h = h0;
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = nextHistory(h, { left: `a${i}`, right: `b${i}` });
  assert.equal(h.undo.length, HISTORY_LIMIT);
  assert.deepEqual(h.undo[0], { left: 'a5', right: 'b5' });
});

test('saveSession/loadSession 与注入 store 往返;键名固定', () => {
  const mem = new Map();
  const store = { setItem: (k, v) => mem.set(k, v), getItem: (k) => (mem.has(k) ? mem.get(k) : null) };
  saveSession(store, '左', '右');
  assert.deepEqual(loadSession(store), { left: '左', right: '右' });
  assert.equal(mem.get(SESSION_KEYS.left), '左');
  assert.equal(mem.get(SESSION_KEYS.right), '右');
});

test('loadSession 容错:缺键/抛错回空串', () => {
  const empty = { setItem: () => {}, getItem: () => null };
  assert.deepEqual(loadSession(empty), { left: '', right: '' });
  const throwing = { setItem: () => {}, getItem: () => { throw new Error('quota'); } };
  assert.deepEqual(loadSession(throwing), { left: '', right: '' });
  let threw = false;
  saveSession({ setItem: () => { threw = true; throw new Error('quota'); }, getItem: () => null }, 'a', 'b'); // 静默
  assert.equal(threw, true);
});
