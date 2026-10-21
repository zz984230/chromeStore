// src/tools/diff/shared/myers.js — 序列 Myers O(ND) 核心 + 行/字符双适配(ADR-0004/0006)。
// 纯函数:无 DOM、无 chrome。D 超限时 diffLines/diffChars 返回 null,由调用方降级。
// 逐轮快照只存活跃切片(k∈[-(d-1),d-1]),D=1000 时内存约 D² 级而非 D×N 级。
import { splitLines } from './lines.js';

// 序列核心:吃任意数组(行/字符只是切分策略,ADR-0006)
export function diffSeq(a, b, dCap) {
  const N = a.length, M = b.length;
  const MAX = N + M;
  if (MAX === 0) return [];
  const off = MAX;
  const v = new Int32Array(2 * MAX + 1);
  const trace = []; // trace[d] = 第 d 轮开打前的 V 活跃切片,base=-(d-1)
  const capped = Math.min(dCap, MAX);
  let found = -1;
  for (let d = 0; d <= capped; d++) {
    trace.push(d === 0 ? Int32Array.from([0]) : v.slice(off - (d - 1), off + d));
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
      else x = v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) { found = d; break; }
    }
    if (found >= 0) break;
  }
  if (found < 0) return null;
  const ops = [];
  let x = N, y = M;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const base = d - 1; // 切片 0 号位存 k=-(d-1),k 的下标 = k+(d-1),base 取 +(d-1) 才能对上
    const k = x - y;
    const prevK = (k === -d || (k !== d && prev[base + k - 1] < prev[base + k + 1])) ? k + 1 : k - 1;
    const prevX = prev[base + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; ops.push({ t: '=', x, y }); }
    if (x === prevX) { y--; ops.push({ t: '+', y }); }
    else { x--; ops.push({ t: '-', x }); }
  }
  while (x > 0 && y > 0) { x--; y--; ops.push({ t: '=', x, y }); }
  return ops.reverse();
}

function trimCommon(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  return { start, endA, endB };
}

// 行级适配:文本进 → 带行号操作序出。dCap 触顶返回 null。
export function diffLines(aText, bText, { dCap = Infinity } = {}) {
  const a = splitLines(aText);
  const b = splitLines(bText);
  const { start, endA, endB } = trimCommon(a, b);
  const mid = diffSeq(a.slice(start, endA), b.slice(start, endB), dCap);
  if (mid === null) return null;
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ t: '=', text: a[i], aLn: i + 1, bLn: i + 1 });
  for (const op of mid) {
    if (op.t === '=') ops.push({ t: '=', text: a[start + op.x], aLn: start + op.x + 1, bLn: start + op.y + 1 });
    else if (op.t === '-') ops.push({ t: '-', text: a[start + op.x], aLn: start + op.x + 1 });
    else ops.push({ t: '+', text: b[start + op.y], bLn: start + op.y + 1 });
  }
  const tailB = endB - endA;
  for (let i = endA; i < a.length; i++) ops.push({ t: '=', text: a[i], aLn: i + 1, bLn: i + tailB + 1 });
  return ops;
}

// 字符级适配(ADR-0006):按码点切分,段式输出(无行号),相邻同侧合并;dCap 触顶返回 null。
export function diffChars(aText, bText, { dCap = Infinity } = {}) {
  const a = Array.from(aText);
  const b = Array.from(bText);
  const { start, endA, endB } = trimCommon(a, b);
  const mid = diffSeq(a.slice(start, endA), b.slice(start, endB), dCap);
  if (mid === null) return null;
  const segs = [];
  const push = (t, text) => {
    const last = segs[segs.length - 1];
    if (last && last.t === t) last.text += text;
    else segs.push({ t, text });
  };
  for (let i = 0; i < start; i++) push('=', a[i]);
  for (const op of mid) {
    if (op.t === '=') push('=', a[start + op.x]);
    else if (op.t === '-') push('-', a[start + op.x]);
    else push('+', b[start + op.y]);
  }
  for (let i = endA; i < a.length; i++) push('=', a[i]);
  return segs;
}

// 降级形(CONTEXT.md「降级」):公共首尾照裁,中间整块 -/+ 呈现
export function degradedLines(aText, bText) {
  const a = splitLines(aText);
  const b = splitLines(bText);
  const { start, endA, endB } = trimCommon(a, b);
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ t: '=', text: a[i], aLn: i + 1, bLn: i + 1 });
  for (let i = start; i < endA; i++) ops.push({ t: '-', text: a[i], aLn: i + 1 });
  for (let i = start; i < endB; i++) ops.push({ t: '+', text: b[i], bLn: i + 1 });
  const tailB = endB - endA;
  for (let i = endA; i < a.length; i++) ops.push({ t: '=', text: a[i], aLn: i + 1, bLn: i + tailB + 1 });
  return ops;
}
