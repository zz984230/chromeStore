// scripts/gen-icons.mjs
// Generates all octopus icons as PNGs (zero dependencies).
// Output: public/icons/{toolbar,dark,light}/{16,32,48,64,128}.png
// Design: rounded-square plate + octopus mark (dome head + eyes + six slim legs),
//         4x4 supersampled antialiasing. Ported from nightveil's generator:
//         PNG encoder / supersampled rasterizer / three-plate SETS kept as-is.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 64, 128];

// set name -> [plate RGB, mark RGB]
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

// 章鱼标记覆盖率 v3:圆顶头 + 双眼(盘色镂空,辨识度关键)+ 六条细腿
// (顶收拢焊入头下缘、外短内长、梢部收细;波浪裙边)。
function octopusMark(px, py) {
  const headR = 0.44, headCy = 0.02;
  const inHead = py <= 0.14 && px * px + (py - headCy) * (py - headCy) <= headR * headR;
  if (inHead) {
    const eyes = [[-0.155, -0.14], [0.155, -0.14]], eyeR = 0.062;
    for (const [ex, ey] of eyes) {
      if ((px - ex) * (px - ex) + (py - ey) * (py - ey) <= eyeR * eyeR) return false;
    }
    return true;
  }
  const legY0 = 0.0;
  const centers = [-0.62, -0.37, -0.12, 0.13, 0.38, 0.63];
  for (let i = 0; i < centers.length; i++) {
    const cx = centers[i];
    const outer = Math.abs(cx) > 0.5;
    const y1 = outer ? 0.78 : (Math.abs(cx) > 0.25 ? 0.90 : 0.86);
    if (py < legY0 || py > y1) continue;
    const t = (py - legY0) / 0.92;
    const spread = cx * (0.55 + 0.45 * t);
    const sway = 0.09 * Math.sin(t * Math.PI * 1.6 + cx * 2.2) * (0.25 + 0.75 * t);
    const dx = px - (spread + sway);
    const tt = (py - legY0) / (y1 - legY0);
    const halfW = 0.062 + 0.028 * (1 - tt);
    if (Math.abs(dx) <= halfW) return true;
  }
  return false;
}

// 标记落位:octopusMark 的着墨范围是 x ∈ [-0.62, 0.60]、y ∈ [-0.42, 0.90]
// (包围盒中心 y = 0.24,不在原点)。把包围盒中心对到盘面中心并整体缩放,
// 否则标记会沉到底、腿尖贴盘缘。标记函数本体保持原样,落位只在这一处。
const MARK_SCALE = 0.50; // 标记坐标 -> 盘面单位方格
const MARK_CY = 0.24;    // 着墨包围盒中心的标记 y

function isMark(x, y) {
  return octopusMark((x - 0.5) / MARK_SCALE, (y - 0.5) / MARK_SCALE + MARK_CY);
}

function render(size, [plate, mark]) {
  const SS = 4; // supersample factor per axis
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let onPlate = 0;
      let onMark = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (sdRoundRect(x - 0.5, y - 0.5, 0.48, 0.22) < 0) {
            onPlate++;
            if (isMark(x, y)) onMark++;
          }
        }
      }
      const total = SS * SS;
      const i = (py * size + px) * 4;
      const aPlate = Math.round((onPlate / total) * 255);
      const aMark = Math.round((onMark / total) * 255);
      const [r, g, b] = aMark > 0 ? mark : plate;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.max(aPlate, aMark);
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
console.log(`[octopus] icons written to public/icons (${Object.keys(SETS).join(', ')} x ${SIZES.join(', ')})`);
