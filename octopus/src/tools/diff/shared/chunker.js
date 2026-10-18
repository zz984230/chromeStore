// src/tools/diff/shared/chunker.js — 操作序 → 交替段;差异块=同位置交替的 -/+ 连续段(CONTEXT.md「差异块」)
export function toChunks(ops) {
  const chunks = [];
  let eq = [], del = [], add = [];
  const flushEq = () => { if (eq.length) { chunks.push({ kind: '=', lines: eq }); eq = []; } };
  const flushDiff = () => { if (del.length || add.length) { chunks.push({ kind: '!', del, add }); del = []; add = []; } };
  for (const op of ops) {
    if (op.t === '=') { flushDiff(); eq.push(op); }
    else { flushEq(); (op.t === '-' ? del : add).push(op); }
  }
  flushDiff();
  flushEq();
  return chunks;
}
