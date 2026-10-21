// src/tools/diff/shared/codepoint.js — 码点字典序比较器(ADR-0007「键码点排序」;归一化器共用)
// 不用默认 sort:它按 UTF-16 码元,增补面字符(emoji 键)会因代理对排在部分 BMP 字符之前。
export function cmpCodePoints(a, b) {
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
