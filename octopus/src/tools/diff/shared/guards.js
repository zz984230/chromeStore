// src/tools/diff/shared/guards.js — 性能护栏单点常量(裁定:双层护栏;数字真机校准)
export const GUARDS = Object.freeze({ MAX_LINES: 20000, MAX_UTF16: 2 * 1024 * 1024, D_CAP: 1000 });

export function checkSide(text) {
  if (typeof text !== 'string' || text.length > GUARDS.MAX_UTF16) return 'bytes';
  if (text !== '' && text.split('\n').length > GUARDS.MAX_LINES) return 'lines';
  return null;
}
