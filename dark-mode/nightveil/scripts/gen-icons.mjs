// scripts/gen-icons.mjs
// Generates all NightVeil icons as PNGs (zero dependencies).
// Output: public/icons/{toolbar,dark,light}/{16,32,48,64,128}.png
// Design: rounded-square plate + crescent moon, 4x4 supersampled antialiasing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 64, 128];

// set name -> [plate RGB, moon RGB]
const SETS = {
  toolbar: [[90, 95, 107], [242, 242, 242]],
  dark: [[30, 34, 48], [232, 226, 212]],
  light: [[233, 233, 236], [58, 63, 74]],
};

// ---------- PNG encoding ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- drawing (unit-square coordinates) ----------
function sdRoundRect(px, py, half, r) {
  const qx = Math.abs(px) - half + r;
  const qy = Math.abs(py) - half + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

const MOON = { cx: 0.42, cy: 0.5, r: 0.3 };
const BITE = { cx: 0.66, cy: 0.36, r: 0.27 };

function inCircle(x, y, c) {
  return Math.hypot(x - c.cx, y - c.cy) < c.r;
}

function isMoon(x, y) {
  return inCircle(x, y, MOON) && !inCircle(x, y, BITE);
}

function render(size, [plate, moon]) {
  const SS = 4; // supersample factor per axis
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let onPlate = 0;
      let onMoon = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (sdRoundRect(x - 0.5, y - 0.5, 0.48, 0.22) < 0) {
            onPlate++;
            if (isMoon(x, y)) onMoon++;
          }
        }
      }
      const total = SS * SS;
      const i = (py * size + px) * 4;
      const aPlate = Math.round((onPlate / total) * 255);
      const aMoon = Math.round((onMoon / total) * 255);
      const [r, g, b] = aMoon > 0 ? moon : plate;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.max(aPlate, aMoon);
    }
  }
  return encodePng(size, rgba);
}

const outRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
for (const [set, palette] of Object.entries(SETS)) {
  const dir = path.join(outRoot, set);
  mkdirSync(dir, { recursive: true });
  for (const size of SIZES) writeFileSync(path.join(dir, `${size}.png`), render(size, palette));
}
console.log(`[nightveil] icons written to public/icons (${Object.keys(SETS).join(', ')} x ${SIZES.join(', ')})`);
