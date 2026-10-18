// src/tools/diff/shared/merge.js — 块级合并(裁定:整块采纳):胜方行同时写入两栏,该块即消
import { joinLines } from './lines.js';

export function applyChunk(chunks, chunkIndex, winner) {
  const target = chunks[chunkIndex];
  if (!target || target.kind !== '!' || (winner !== 'left' && winner !== 'right')) return null;
  const leftLines = [], rightLines = [];
  chunks.forEach((c, i) => {
    if (c.kind === '=') { for (const op of c.lines) { leftLines.push(op.text); rightLines.push(op.text); } return; }
    if (i === chunkIndex) {
      const won = winner === 'left' ? c.del : c.add;
      for (const op of won) { leftLines.push(op.text); rightLines.push(op.text); }
      return;
    }
    for (const op of c.del) leftLines.push(op.text);
    for (const op of c.add) rightLines.push(op.text);
  });
  return { left: joinLines(leftLines), right: joinLines(rightLines) };
}
