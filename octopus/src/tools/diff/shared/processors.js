// src/tools/diff/shared/processors.js — 六文本处理器(纯函数;复刻 DiffSuite 文本处理,裁定 1)
import { splitLines, joinLines } from './lines.js';

export function sortLines(text) { return joinLines(splitLines(text).sort()); }
export function reverseLines(text) { return joinLines(splitLines(text).reverse()); }
export function dropEmptyLines(text) { return joinLines(splitLines(text).filter((l) => l.trim() !== '')); } // 纯空白行亦算空行
export function dedupeLines(text) { return joinLines([...new Set(splitLines(text))]); } // 保序:保留首次出现
export function trimLines(text) { return joinLines(splitLines(text).map((l) => l.trim())); }
export function joinWithSpaces(text) { return splitLines(text).join(' '); }

// 键 = 工作页 data-op 值
export const PROCESSORS = Object.freeze({
  sort: sortLines, reverse: reverseLines, dropEmpty: dropEmptyLines,
  dedupe: dedupeLines, trim: trimLines, joinSpace: joinWithSpaces,
});
