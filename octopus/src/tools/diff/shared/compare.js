// src/tools/diff/shared/compare.js — 对比管线:护栏 → 归一化缝 → 行级 diff → 降级(ADR-0004/0007)
import { GUARDS, checkSide } from './guards.js';
import { diffLines, degradedLines } from './myers.js';
import { normalizeJson } from './norm-json.js';

// 归一化缝(ADR-0007 结果对象契约):text 恒等;JSON 已入,YAML/TOML 后续各补一员,引擎不动
export const NORMALIZERS = Object.freeze({
  text: (t) => ({ ok: true, text: t }),
  json: normalizeJson,
});

// 归一化一侧:失败按调用侧归属栏;产物过同一护栏,展开超限拒绝并区分(ADR-0007 双道护栏)
function normalizeSide(fn, text, side) {
  const r = fn(text);
  if (!r.ok) return { ok: false, rejected: { side, ...r.reason } };
  const over = checkSide(r.text);
  if (over) return { ok: false, rejected: { side, kind: `expanded-${over}` } };
  return r;
}

export function runCompare(leftText, rightText, { normalizer = NORMALIZERS.text, dCap = GUARDS.D_CAP } = {}) {
  const leftErr = checkSide(leftText);
  if (leftErr) return { ok: false, rejected: { side: 'left', kind: leftErr } };
  const rightErr = checkSide(rightText);
  if (rightErr) return { ok: false, rejected: { side: 'right', kind: rightErr } };
  const a = normalizeSide(normalizer, leftText, 'left');
  if (!a.ok) return a;
  const b = normalizeSide(normalizer, rightText, 'right');
  if (!b.ok) return b;
  const ops = diffLines(a.text, b.text, { dCap });
  if (ops === null) return { ok: true, degraded: true, ops: degradedLines(a.text, b.text), normLeft: a.text, normRight: b.text };
  return { ok: true, degraded: false, ops, normLeft: a.text, normRight: b.text };
}
