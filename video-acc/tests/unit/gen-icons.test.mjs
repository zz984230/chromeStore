// tests/unit/gen-icons.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// 解出 RGBA 像素（编码器恒用 filter: none，展平即可）
function decodeRgba(buf) {
  const size = buf.readUInt32BE(16);
  const idatAt = buf.indexOf(Buffer.from('IDAT'));
  const len = buf.readUInt32BE(idatAt - 4);
  const raw = inflateSync(buf.subarray(idatAt + 4, idatAt + 4 + len));
  const stride = size * 4;
  const at = (x, y) => raw.subarray(y * (stride + 1) + 1 + x * 4, y * (stride + 1) + 1 + x * 4 + 4);
  return { size, at };
}

test('图标再生成为各尺寸合法方形 PNG', () => {
  execFileSync(process.execPath, ['scripts/gen-icons.mjs']);
  for (const size of SIZES) {
    const buf = readFileSync(`public/icons/${size}.png`);
    assert.deepEqual(buf.subarray(0, 8), PNG_SIGNATURE, `${size} PNG 魔数`);
    assert.equal(buf.readUInt32BE(16), size, `${size} IHDR 宽`);
    assert.equal(buf.readUInt32BE(20), size, `${size} IHDR 高`);
  }
});

test('128px 图标像素符合设计：靛蓝底、米白箭头、圆角透明', () => {
  const { size, at } = decodeRgba(readFileSync('public/icons/128.png'));
  assert.equal(size, 128);
  assert.deepEqual([...at(46, 64).subarray(0, 3)], [244, 244, 250], '箭头笔画颜色');
  assert.deepEqual([...at(64, 64).subarray(0, 3)], [37, 42, 68], '底板颜色');
  assert.ok(at(1, 1)[3] < 10, `圆角透明度 ${at(1, 1)[3]}`);
});
