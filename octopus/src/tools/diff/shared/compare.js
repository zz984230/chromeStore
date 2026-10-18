// src/tools/diff/shared/compare.js — 对比管线:护栏 → 归一化缝 → 行级 diff → 降级(ADR-0004)
import { GUARDS, checkSide } from './guards.js';
import { diffLines, degradedLines } from './myers.js';

// 归一化缝:v1 恒等;JSON/YAML/TOML 是后续里程碑各补一个归一化器,引擎不动
export const NORMALIZERS = Object.freeze({ text: (t) => t });

export function runCompare(leftText, rightText, { normalizer = NORMALIZERS.text, dCap = GUARDS.D_CAP } = {}) {
  const error = checkSide(leftText) ?? checkSide(rightText);
  if (error) return { ok: false, error };
  const a = normalizer(leftText);
  const b = normalizer(rightText);
  const ops = diffLines(a, b, { dCap });
  if (ops === null) return { ok: true, degraded: true, ops: degradedLines(a, b) };
  return { ok: true, degraded: false, ops };
}
