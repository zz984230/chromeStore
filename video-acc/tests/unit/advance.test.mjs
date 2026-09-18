// tests/unit/advance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceScore, pickAdvanceIndex } from '../../src/content/advance.js';

test('强词打分高于弱词，label 加倍', () => {
  const strong = advanceScore({ label: '下一节', text: '', cls: '' });
  const strongText = advanceScore({ label: '', text: '下一章', cls: '' });
  const weak = advanceScore({ label: 'next', text: '', cls: '' });
  const clsOnly = advanceScore({ label: '', text: '', cls: 'btn-next-arrow' });
  assert.ok(strong > weak && weak > clsOnly && clsOnly > 0, `强>${weak}>${clsOnly}>0`);
  assert.ok(strongText > 0 && strong > strongText, 'label 命中权重高于正文');
});

test('负词与禁用一票否决', () => {
  assert.equal(advanceScore({ label: '下一节', text: '', cls: '' , disabled: true }), -Infinity);
  assert.equal(advanceScore({ label: '', text: '下一个标签页', cls: '' }), -Infinity);
  assert.equal(advanceScore({ label: '上一节', text: '', cls: '' }), -Infinity);
  assert.equal(advanceScore({ label: '', text: '下一页', cls: '' }), -Infinity);
  assert.equal(advanceScore({ label: '', text: '相关推荐', cls: '' }), -Infinity);
});

test('pickAdvanceIndex 取最高分、无候选返回 -1', () => {
  const ds = [
    { label: '', text: '目录', cls: '' },
    { label: '下一节', text: '', cls: '' },
    { label: '', text: 'next', cls: '' },
  ];
  assert.equal(pickAdvanceIndex(ds), 1);
  assert.equal(pickAdvanceIndex([{ label: '', text: '上一节', cls: '' }]), -1);
  assert.equal(pickAdvanceIndex([]), -1);
});

test('英文强词与中文变体', () => {
  assert.ok(advanceScore({ label: 'Next Episode', text: '', cls: '' }) > 3);
  assert.ok(advanceScore({ label: '', text: '下一课', cls: '' }) > 0);
  assert.ok(advanceScore({ label: '', text: '下一P', cls: '' }) > 0);
});
