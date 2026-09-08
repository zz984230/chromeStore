// tests/unit/icons.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SETS = ['toolbar', 'dark', 'light'];
const SIZES = [16, 32, 48, 64, 128];

test('icons regenerate as valid square PNGs for every set and size', () => {
  execFileSync(process.execPath, ['scripts/gen-icons.mjs']);
  for (const set of SETS) {
    for (const size of SIZES) {
      const buf = readFileSync(`public/icons/${set}/${size}.png`);
      assert.deepEqual(buf.subarray(0, 8), PNG_SIGNATURE, `${set}/${size} PNG signature`);
      assert.equal(buf.readUInt32BE(16), size, `${set}/${size} IHDR width`);
      assert.equal(buf.readUInt32BE(20), size, `${set}/${size} IHDR height`);
    }
  }
});

test('dark and light state icons are visually distinct files', () => {
  assert.notDeepEqual(
    readFileSync('public/icons/dark/64.png'),
    readFileSync('public/icons/light/64.png'),
  );
});
