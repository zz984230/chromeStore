// src/tools/diff/shared/lines.js — 行语义统一:空文本=零行;结尾换行产生一个空行(真实差异)
export function splitLines(text) {
  if (typeof text !== 'string') return [];
  return text === '' ? [] : text.split('\n');
}

export function joinLines(lines) {
  return lines.length === 0 ? '' : lines.join('\n');
}
