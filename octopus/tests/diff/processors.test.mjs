// tests/diff/processors.test.mjs — 六文本处理器(复刻 DiffSuite 文本处理;纯函数)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROCESSORS,
  sortLines, reverseLines, dropEmptyLines, dedupeLines, trimLines, joinWithSpaces,
} from '../../src/tools/diff/shared/processors.js';

test('空输入恒等返回空串', () => {
  for (const fn of Object.values(PROCESSORS)) assert.equal(fn(''), '');
});

test('sortLines 按码元序排序(空行排最前)', () => {
  assert.equal(sortLines('b\na\nc'), 'a\nb\nc');
  assert.equal(sortLines('a\n\nb'), '\na\nb');
});

test('reverseLines 反向行序', () => {
  assert.equal(reverseLines('a\nb\nc'), 'c\nb\na');
  assert.equal(reverseLines('a'), 'a');
});

test('dropEmptyLines 去空行:纯空白行亦算空行', () => {
  assert.equal(dropEmptyLines('a\n\nb'), 'a\nb');
  assert.equal(dropEmptyLines('a\n \t \nb'), 'a\nb');
  assert.equal(dropEmptyLines('\n\n'), '');
});

test('dedupeLines 保序去重,保留首次出现', () => {
  assert.equal(dedupeLines('b\na\nb\na\nc'), 'b\na\nc');
  assert.equal(dedupeLines('a\n\n\n'), 'a\n');
});

test('trimLines 去每行首尾空白', () => {
  assert.equal(trimLines('  a \nb\t'), 'a\nb');
});

test('joinWithSpaces 换行换空格', () => {
  assert.equal(joinWithSpaces('a\nb\nc'), 'a b c');
  assert.equal(joinWithSpaces('a\n'), 'a ');
});

test('PROCESSORS 六键齐备且与函数对应', () => {
  assert.equal(PROCESSORS.sort, sortLines);
  assert.equal(PROCESSORS.reverse, reverseLines);
  assert.equal(PROCESSORS.dropEmpty, dropEmptyLines);
  assert.equal(PROCESSORS.dedupe, dedupeLines);
  assert.equal(PROCESSORS.trim, trimLines);
  assert.equal(PROCESSORS.joinSpace, joinWithSpaces);
});
