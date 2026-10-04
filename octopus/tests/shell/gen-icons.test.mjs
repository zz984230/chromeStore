// tests/shell/gen-icons.test.mjs — 三盘 × 五尺寸合法 PNG;深浅盘双色采样
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SETS = ['toolbar', 'dark', 'light'];
const SIZES = [16, 32, 48, 64, 128];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodeRgba(buf) {
  const size = buf.readUInt32BE(16);
  const idatAt = buf.indexOf(Buffer.from('IDAT'));
  const len = buf.readUInt32BE(idatAt - 4);
  const raw = inflateSync(buf.subarray(idatAt + 4, idatAt + 4 + len));
  const stride = size * 4;
  const at = (x, y) => raw.subarray(y * (stride + 1) + 1 + x * 4, y * (stride + 1) + 1 + x * 4 + 4);
  return { size, at };
}

test('章鱼三盘再生成:各盘各尺寸合法方形 PNG', () => {
  execFileSync(process.execPath, ['scripts/gen-icons.mjs']);
  for (const set of SETS) for (const size of SIZES) {
    const buf = readFileSync(`public/icons/${set}/${size}.png`);
    assert.deepEqual(buf.subarray(0, 8), PNG_SIGNATURE, `${set}/${size} PNG 魔数`);
    assert.equal(buf.readUInt32BE(16), size, `${set}/${size} IHDR 宽`);
    assert.equal(buf.readUInt32BE(20), size, `${set}/${size} IHDR 高`);
  }
});

test('深浅盘确实异色(同形换色机制的最小活体证明)', () => {
  const dark = decodeRgba(readFileSync('public/icons/dark/64.png'));
  const light = decodeRgba(readFileSync('public/icons/light/64.png'));
  assert.equal(dark.size, 64);
  const d = dark.at(8, 8), l = light.at(8, 8);
  assert.notDeepEqual(d, l, '深浅盘同坐标像素应不同色');
});
