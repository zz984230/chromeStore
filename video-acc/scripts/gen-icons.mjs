// scripts/gen-icons.mjs
// 生成视频倍速助手图标 PNG（零依赖）：圆角方板 + 双箭头 »
// 输出: public/icons/{16,32,48,128}.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

const SIZES = [16, 32, 48, 128];
const PLATE = [37, 42, 68];     // 深靛蓝底
const STROKE = [244, 244, 250]; // 米白箭头

// ---------- PNG 编码 ----------
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
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 绘制 ----------
// 单位坐标 (0..1) 下的距离场；SDF 里侧为负。
function roundedPlateDist(px, py) {
  const r = 0.22; // 圆角半径
  const qx = Math.max(Math.abs(px - 0.5) - (0.5 - r), 0);
  const qy = Math.max(Math.abs(py - 0.5) - (0.5 - r), 0);
  return Math.hypot(qx, qy) - r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 一个 ">" 折线：顶点 (cx, 0.5)，两臂向左上 / 左下张开
function chevronDist(px, py, cx, arm) {
  return Math.min(
    distToSegment(px, py, cx - arm, 0.5 - arm, cx, 0.5),
    distToSegment(px, py, cx, 0.5, cx - arm, 0.5 + arm),
  );
}

function render(size) {
  const S = 4; // 4× 超采样抗锯齿
  const ARM = 0.16;             // 箭头臂长
  const HALF = 0.045;           // 笔画半宽
  const CENTERS = [0.36, 0.64]; // 两个 ">" 的顶点 x
  const buf = Buffer.alloc(size * size * 4);
  const mix = (fg, bg, a) => Math.round(bg + (fg - bg) * a);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let plateHits = 0, inkHits = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = (x + (sx + 0.5) / S) / size;
          const py = (y + (sy + 0.5) / S) / size;
          if (roundedPlateDist(px, py) <= 0) {
            plateHits++;
            if (CENTERS.some((c) => chevronDist(px, py, c, ARM) <= HALF)) inkHits++;
          }
        }
      }
      const total = S * S;
      const o = (y * size + x) * 4;
      const inkA = inkHits / total;
      buf[o] = mix(STROKE[0], PLATE[0], inkA);
      buf[o + 1] = mix(STROKE[1], PLATE[1], inkA);
      buf[o + 2] = mix(STROKE[2], PLATE[2], inkA);
      buf[o + 3] = Math.round(255 * (plateHits / total));
    }
  }
  return buf;
}

const outDir = path.resolve('public/icons');
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  writeFileSync(path.join(outDir, `${size}.png`), encodePng(size, render(size)));
  console.log(`[icons] public/icons/${size}.png`);
}
