// tests/unit/editor.test.mjs
// D4 档（M3-BEHAVIOR §4.2/§11）：Tab 软缩进 2（选区缩进/退缩）、括号/引号自动
// 配对（含包裹选区）、退格删空整对。autoIndent/overwrite/replaceTab 不做。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEditorKey } from '../../src/options/editor.js';

const at = (text, selStart, selEnd = selStart) => ({ text, selStart, selEnd });

test('Tab with no selection inserts two spaces, caret advances', () => {
  assert.deepEqual(applyEditorKey(at('a{}', 1), { key: 'Tab' }), at('a  {}', 3));
});

test('Tab with selection replaces it with indent', () => {
  assert.deepEqual(applyEditorKey(at('aXYb', 1, 3), { key: 'Tab' }), at('a  b', 3));
});

test('Tab with a multiline selection indents every selected line', () => {
  // '.a {\ncolor: red\n}' 选区 [5,17) 覆盖第二、三行
  const r = applyEditorKey(at('.a {\ncolor: red\n}', 5, 17), { key: 'Tab' });
  assert.equal(r.text, '.a {\n  color: red\n  }');
  assert.equal(r.selStart, 9);
  // 选区 [5,17) 含行尾的 '}'，缩进后映射到 [9,21)：仍选中末尾的 '}'。
  assert.equal(r.selEnd, 21);
});

test('Shift+Tab outdents selected lines by one unit; bare lines unchanged', () => {
  const r = applyEditorKey(at('.a {\n  color: red\n}', 0, 20), { key: 'Tab', shiftKey: true });
  assert.equal(r.text, '.a {\ncolor: red\n}');
});

test('typing an opener inserts the pair, caret between', () => {
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}'], ["'", "'"], ['"', '"'], ['`', '`']]) {
    const r = applyEditorKey(at('a b', 1), { key: open });
    assert.deepEqual(r, at(`a${open}${close} b`, 2), `pair for ${open}`);
  }
});

test('typing an opener around a selection wraps it', () => {
  const r = applyEditorKey(at('aXYZb', 1, 4), { key: '(' });
  assert.deepEqual(r, at('a(XYZ)b', 2, 5));
});

test('Backspace inside an empty pair deletes both, caret between', () => {
  const r = applyEditorKey(at('a()b', 2), { key: 'Backspace' });
  assert.deepEqual(r, at('ab', 1));
});

test('Backspace on a non-pair falls through (null)', () => {
  assert.equal(applyEditorKey(at('axb', 2), { key: 'Backspace' }), null);
  assert.equal(applyEditorKey(at('a(xb', 3), { key: 'Backspace' }), null);
});

test('any other key falls through (null)', () => {
  assert.equal(applyEditorKey(at('ab', 1), { key: 'x' }), null);
  assert.equal(applyEditorKey(at('ab', 1), { key: 'Enter' }), null, 'autoIndent 不做（D4）');
});
