// src/tools/diff/page/state.js — 工作页状态:合并撤销栈(快照式,裁定 5)+ 文本会话兜底(裁定 7)
export const HISTORY_LIMIT = 100;
export const SESSION_KEYS = Object.freeze({ left: 'diff.left', right: 'diff.right' });

export function nextHistory(hist, snap) {
  return { undo: [...hist.undo, snap].slice(-HISTORY_LIMIT), redo: [] };
}

export function undoFrom(texts, hist) {
  if (hist.undo.length === 0) return null;
  return { texts: hist.undo[hist.undo.length - 1], hist: { undo: hist.undo.slice(0, -1), redo: [...hist.redo, texts] } };
}

export function redoFrom(texts, hist) {
  if (hist.redo.length === 0) return null;
  return { texts: hist.redo[hist.redo.length - 1], hist: { undo: [...hist.undo, texts], redo: hist.redo.slice(0, -1) } };
}

export function saveSession(store, left, right) {
  try { store.setItem(SESSION_KEYS.left, left); store.setItem(SESSION_KEYS.right, right); } catch { /* 配额/隐私模式:兜底失败即静默 */ }
}

export function loadSession(store) {
  try {
    const left = store.getItem(SESSION_KEYS.left);
    const right = store.getItem(SESSION_KEYS.right);
    return { left: typeof left === 'string' ? left : '', right: typeof right === 'string' ? right : '' };
  } catch { return { left: '', right: '' }; }
}
