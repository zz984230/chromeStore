// tests/diff/compare.test.mjs — 管线:护栏 → 归一化缝 → 行级 diff → 降级(ADR-0004)
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUARDS, checkSide } from '../../src/tools/diff/shared/guards.js';
import { runCompare, NORMALIZERS } from '../../src/tools/diff/shared/compare.js';

test('GUARDS 单点常量与裁定一致', () => {
  assert.equal(GUARDS.MAX_LINES, 20000);
  assert.equal(GUARDS.MAX_UTF16, 2 * 1024 * 1024);
  assert.equal(GUARDS.D_CAP, 1000);
});

test('checkSide:行数与字节双硬顶,恰在限内放行', () => {
  assert.equal(checkSide(''), null);
  assert.equal(checkSide(Array.from({ length: 20000 }, () => 'x').join('\n')), null); // 恰 20000 行
  assert.equal(checkSide(Array.from({ length: 20001 }, () => 'x').join('\n')), 'lines');
  assert.equal(checkSide('a'.repeat(GUARDS.MAX_UTF16)), null);
  assert.equal(checkSide('a'.repeat(GUARDS.MAX_UTF16 + 1)), 'bytes');
});

test('runCompare 正常路:等价文本全等序,不降级', () => {
  const res = runCompare('a\nb', 'a\nb');
  assert.equal(res.ok, true);
  assert.equal(res.degraded, false);
  assert.equal(res.ops.length, 2);
});

test('runCompare 护栏拒绝任一侧超限', () => {
  assert.deepEqual(runCompare('x\n'.repeat(20001), ''), { ok: false, error: 'lines' });
  assert.deepEqual(runCompare('', 'a'.repeat(GUARDS.MAX_UTF16 + 1)), { ok: false, error: 'bytes' });
});

test('runCompare D 超限走降级:前后缀照裁+整块', () => {
  const res = runCompare('h\nx\ny\nt', 'h\np\nq\nt', { dCap: 1 });
  assert.equal(res.ok, true);
  assert.equal(res.degraded, true);
  assert.deepEqual(res.ops.map((o) => o.t), ['=', '-', '-', '+', '+', '=']);
});

test('runCompare 默认 dCap 取 GUARDS.D_CAP:真实规模同构文本不降级', () => {
  const a = Array.from({ length: 500 }, (_, i) => `l${i}`);
  const b = [...a]; b[10] = 'changed';
  const res = runCompare(a.join('\n'), b.join('\n'));
  assert.equal(res.degraded, false);
  assert.equal(res.ops.filter((o) => o.t === '-').length, 1);
});

test('归一化缝:自定义归一化器参与比较(缝的可换性)', () => {
  const upper = (t) => t.toUpperCase();
  assert.equal(NORMALIZERS.text('a'), 'a'); // v1 恒等
  const res = runCompare('a\nb', 'A\nB', { normalizer: upper });
  assert.equal(res.degraded, false);
  assert.deepEqual(res.ops.map((o) => o.t), ['=', '=']);
});
