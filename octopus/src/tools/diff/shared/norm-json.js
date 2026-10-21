// src/tools/diff/shared/norm-json.js — JSON 归一化器(ADR-0007):值等价⇒文本等价,幂等;
// 键码点排序/数组保序/2 空格/文末一换行。JS number 语义:>2^53 精度损失为已知限制,接受。
const INDENT = 2;

// 码点字典序。不用默认 sort:它按 UTF-16 码元,增补面字符(emoji 键)会因
// 代理对排在部分 BMP 字符之前,与码点序相悖。
function cmpCodePoints(a, b) {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done || y.done) return x.done && y.done ? 0 : x.done ? -1 : 1;
    const d = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (d !== 0) return d;
  }
}

function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort(cmpCodePoints)) out[k] = canon(value[k]);
    return out;
  }
  return value;
}

// V8 两种带位报错格式都认:旧「position N」(字符偏移,换算行列)与新「(line L column C)」;
// 都不带则行列留 null——如实呈现,不猜(行列「能取到时」才给,ADR-0007)。
function reasonFromError(err, text) {
  const msg = String(err?.message ?? err);
  let m = /\(line (\d+) column (\d+)\)/.exec(msg);
  if (m) return { kind: 'syntax', line: Number(m[1]), col: Number(m[2]), detail: msg };
  m = /position (\d+)/.exec(msg);
  if (m) {
    const offset = Math.min(Number(m[1]), text.length);
    const head = text.slice(0, offset);
    const nl = head.lastIndexOf('\n');
    return { kind: 'syntax', line: nl < 0 ? 1 : head.split('\n').length, col: offset - nl, detail: msg };
  }
  return { kind: 'syntax', line: null, col: null, detail: msg };
}

export function normalizeJson(text) {
  let value;
  try { value = JSON.parse(text); } catch (err) { return { ok: false, reason: reasonFromError(err, text) } };
  return { ok: true, text: JSON.stringify(canon(value), null, INDENT) + '\n' };
}
