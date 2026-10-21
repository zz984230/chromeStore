// src/tools/diff/shared/numbers.js — 数字规范形发射(TOML/YAML 共用,ADR-0007 值等价)
// int 十进制;-0 归 0;float 走 String(n) 最短往返,无小数点/指数则补 .0,e+ 归 e;inf/nan 裸形
export function emitInt(n) { return String(n); }

export function emitFloat(n) {
  if (Number.isNaN(n)) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  if (Object.is(n, -0)) n = 0;
  let s = String(n);
  if (!/[.eE]/.test(s)) s += '.0';
  return s.replace('e+', 'e');
}
