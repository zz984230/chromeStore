// src/tools/diff/shared/intraline.js — 配对行字符级高亮(ADR-0006;CONTEXT.md「配对行」「字符级高亮」)。
// 纯函数:块内第 i 条删行配第 i 条增行;落单/超限/预算尽 → null(整行铺色,静默)。
import { diffChars } from './myers.js';
import { GUARDS } from './guards.js';

const CHAR_MAX = 2000; // 单行字符数(码点)超此跳过该对
const CHUNK_BUDGET = 40000; // 块内配对行字符总量预算,防大块累计卡顿

// 一对配对行 → null | { del: Seg[], add: Seg[] };Seg = { hot, text }
export function intralinePair(delText, addText, { dCap = GUARDS.D_CAP, charMax = CHAR_MAX } = {}) {
  if (delText.length > charMax || addText.length > charMax) return null;
  const segs = diffChars(delText, addText, { dCap });
  if (segs === null) return null;
  const side = (drop) => segs.filter((s) => s.t !== drop).map((s) => ({ hot: s.t !== '=', text: s.text }));
  return { del: side('+'), add: side('-') };
}

// 差异块 → 两侧逐行段标记:配对数 = min(del,add),预算先扣后算,耗尽即止
export function intralineChunk(chunk, { dCap, charMax, chunkBudget = CHUNK_BUDGET } = {}) {
  const n = Math.min(chunk.del.length, chunk.add.length);
  let budget = chunkBudget;
  const del = new Array(chunk.del.length).fill(null);
  const add = new Array(chunk.add.length).fill(null);
  for (let i = 0; i < n; i++) {
    budget -= chunk.del[i].text.length + chunk.add[i].text.length;
    if (budget < 0) break;
    const pair = intralinePair(chunk.del[i].text, chunk.add[i].text, { dCap, charMax });
    if (pair) { del[i] = pair.del; add[i] = pair.add; }
  }
  return { del, add };
}
