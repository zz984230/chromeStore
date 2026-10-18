// scripts/gen-icons.mjs
// Generates all octopus icons as PNGs (zero dependencies).
// Output: public/icons/{toolbar,dark,light}/{16,32,48,64,128}.png
// Design: rounded-square plate + octopus mark v5 (dome head + wide low oval eyes
//         + six legs drawn as tapered arc strokes ending in outward curls —
//         the octopus signifier; leg tips land on one scalloped hem line),
//         4x4 supersampled antialiasing. Ported from nightveil's generator:
//         PNG encoder / supersampled rasterizer kept as-is;三盘配色改夜与金(见 SETS)。
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 64, 128];

// set name -> [plate RGB, mark RGB]
const SETS = {
  // 三盘皆入夜与金(veil --line 家族 / --gold,与扩展 UI 同源):
  // toolbar=manifest 静态盘(扩展卡片/安装气泡);dark=veil 开(夜幕落,夜盘金章鱼);
  // light=veil 关(白昼,金盘夜章鱼)——昼夜互换、状态可辨,setIcon 真话化保留。
  // dark/light 两盘仅被 background 的 setIcon 引用,别无他用。
  toolbar: [[27, 34, 51], [227, 201, 135]],
  dark: [[27, 34, 51], [227, 201, 135]],
  light: [[227, 201, 135], [27, 34, 51]],
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

// 章鱼标记覆盖率 v5:圆顶头(低平切)+ 宽而低的椭圆大眼(仍低于头中线,防读成水母)
// + 六腿三对镜像,每腿 = 锥形扫摆段(二次贝塞尔)+ 梢部外卷小勾(精确圆弧,
// 曲率中心在切线法向外侧)——卷曲是章鱼的决定性符号;腿长梯度使腿尖落在
// 一条浅弧摆线上,底缘读成整体下摆而非参差发丝。

function quadSample(p0, p1, p2, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}

// 在扫摆段终点沿切向外接一段精确圆弧卷勾(勾尖朝外上回卷)
function appendCurl(pts, rho, theta, n) {
  const K = pts[pts.length - 1], prev = pts[pts.length - 2];
  let dx = K[0] - prev[0], dy = K[1] - prev[1];
  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;
  const C = [K[0] + rho * dy, K[1] - rho * dx]; // 曲率中心在切线法向(外上)一侧
  const phi0 = Math.atan2(K[1] - C[1], K[0] - C[0]);
  // 选使弧起始切向与扫摆方向一致的绕向
  const s = Math.sign(-Math.sin(phi0) * dx + Math.cos(phi0) * dy) || 1;
  for (let i = 1; i <= n; i++) {
    const phi = phi0 + s * theta * (i / n);
    pts.push([C[0] + rho * Math.cos(phi), C[1] + rho * Math.sin(phi)]);
  }
}

const HEAD = { cy: -0.08, r: 0.42, cut: 0.12 };
const EYES = [[-0.155, -0.010], [0.155, -0.010]], EYE_RX = 0.082, EYE_RY = 0.104;

// 右侧三腿:[P0, P1, P2, 卷勾半径, 卷勾角],左侧由镜像生成(镜像保形不保绕向)
const LEG_DEFS = [
  [[0.11, 0.06], [0.05, 0.30], [0.12, 0.52], 0.090, 2.6],
  [[0.27, 0.04], [0.26, 0.26], [0.38, 0.45], 0.100, 2.8],
  [[0.38, -0.02], [0.45, 0.16], [0.54, 0.34], 0.095, 2.9],
];

function buildLeg(def) {
  const [p0, p1, p2, rho, theta] = def;
  const pts = quadSample(p0, p1, p2, 36);
  appendCurl(pts, rho, theta, 22);
  let total = 0;
  const arc = [0];
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    arc.push(total);
  }
  const W0 = 0.085, W1 = 0.026;
  const leg = pts.map((p, i) => {
    const t = arc[i] / total;
    return { x: p[0], y: p[1], w: W0 + (W1 - W0) * Math.pow(t, 0.85) };
  });
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of leg) {
    x0 = Math.min(x0, p.x - p.w); x1 = Math.max(x1, p.x + p.w);
    y0 = Math.min(y0, p.y - p.w); y1 = Math.max(y1, p.y + p.w);
  }
  leg.bbox = { x0, x1, y0, y1 };
  return leg;
}

const LEGS_R = LEG_DEFS.map(buildLeg);
const LEGS = [...LEGS_R, ...LEGS_R.map(leg => leg.map(pt => ({ ...pt, x: -pt.x })))];
for (const leg of LEGS.slice(3)) { // 镜像腿重算包围盒
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of leg) {
    x0 = Math.min(x0, p.x - p.w); x1 = Math.max(x1, p.x + p.w);
    y0 = Math.min(y0, p.y - p.w); y1 = Math.max(y1, p.y + p.w);
  }
  leg.bbox = { x0, x1, y0, y1 };
}

function octopusMark(px, py) {
  const dy = py - HEAD.cy;
  if (py <= HEAD.cut && px * px + dy * dy <= HEAD.r * HEAD.r) {
    for (const [ex, ey] of EYES) {
      const exx = (px - ex) / EYE_RX, eyy = (py - ey) / EYE_RY;
      if (exx * exx + eyy * eyy <= 1) return false;
    }
    return true;
  }
  for (const leg of LEGS) {
    const b = leg.bbox;
    if (px < b.x0 || px > b.x1 || py < b.y0 || py > b.y1) continue;
    let hit = false;
    for (let i = 0; i < leg.length - 1; i++) {
      const a = leg[i], c = leg[i + 1];
      const vx = c.x - a.x, vy = c.y - a.y;
      const L2 = vx * vx + vy * vy;
      let t = L2 ? ((px - a.x) * vx + (py - a.y) * vy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - (a.x + t * vx), qy = py - (a.y + t * vy);
      const w = a.w + (c.w - a.w) * t;
      if (qx * qx + qy * qy <= w * w) { hit = true; break; }
    }
    if (hit) return true;
    const tip = leg[leg.length - 1];
    const tx = px - tip.x, ty = py - tip.y;
    if (tx * tx + ty * ty <= tip.w * tip.w) return true;
  }
  return false;
}

// 标记落位:octopusMark v5 的着墨包围盒 x ∈ [-0.748, 0.747]、y ∈ [-0.498, 0.617]
// (中心 y = 0.060)。把包围盒中心对到盘面中心并整体缩放(步长 0.0025 网格
// 采样推导:宽度是约束维,留边 0.045 → SCALE 0.582)。标记函数本体保持原样,
// 落位只在这一处。
const MARK_SCALE = 0.582; // 标记坐标 -> 盘面单位方格
const MARK_CY = 0.060;    // 着墨包围盒中心的标记 y

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
