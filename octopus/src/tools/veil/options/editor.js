// src/options/editor.js
// behave-lite（M3-BEHAVIOR §4.2，D4 档）：Tab 软缩进（2 空格，选区逐行缩进/
// Shift+Tab 退缩）、括号与引号自动配对（选区包裹）、退格删空整对。
// 纯函数核心 applyEditorKey 便于直测；wireEditor 负责 DOM 接线。
const INDENT = '  ';
const PAIRS = { '(': ')', '[': ']', '{': '}', "'": "'", '"': '"', '`': '`' };

export function applyEditorKey(state, ev) {
  const { text } = state;
  const s = Math.min(state.selStart, state.selEnd);
  const e = Math.max(state.selStart, state.selEnd);
  if (ev.key === 'Tab') {
    // 单行/无选区：插入（或替换为）一个缩进单位；跨行选区 / Shift+Tab：逐行缩进/退缩。
    const multiline = text.slice(s, e).includes('\n');
    if (multiline || ev.shiftKey) return indentSelection(text, s, e, Boolean(ev.shiftKey));
    return { text: text.slice(0, s) + INDENT + text.slice(e), selStart: s + INDENT.length, selEnd: s + INDENT.length };
  }
  if (ev.key === 'Backspace' && s === e && s > 0) {
    const before = text[s - 1];
    const after = text[s];
    if (PAIRS[before] && PAIRS[before] === after) {
      return { text: text.slice(0, s - 1) + text.slice(s + 1), selStart: s - 1, selEnd: s - 1 };
    }
    return null;
  }
  if (PAIRS[ev.key] && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    if (s !== e) {
      const inner = text.slice(s, e);
      return { text: text.slice(0, s) + ev.key + inner + PAIRS[ev.key] + text.slice(e), selStart: s + 1, selEnd: e + 1 };
    }
    return { text: text.slice(0, s) + ev.key + PAIRS[ev.key] + text.slice(s), selStart: s + 1, selEnd: s + 1 };
  }
  return null;
}

function indentSelection(text, s, e, outdent) {
  const lineStart = text.lastIndexOf('\n', s - 1) + 1;
  const seg = text.slice(lineStart, e);
  const lines = seg.split('\n');
  const updated = lines.map((l) => (outdent ? (l.startsWith(INDENT) ? l.slice(INDENT.length) : l) : INDENT + l));
  const joined = updated.join('\n');
  const next = text.slice(0, lineStart) + joined + text.slice(e);
  // 退缩时选区起点最多退到行首；缩进时整体前移一个单位。
  const delta = outdent
    ? Math.max(joined.length - seg.length, -(s - lineStart))
    : INDENT.length * lines.length;
  return { text: next, selStart: Math.max(lineStart, s + delta), selEnd: lineStart + joined.length };
}

export function wireEditor(textarea) {
  textarea.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key !== 'Tab' && ev.key !== 'Backspace' && !PAIRS[ev.key]) return;
    const next = applyEditorKey(
      { text: textarea.value, selStart: textarea.selectionStart, selEnd: textarea.selectionEnd },
      ev,
    );
    if (!next) return;
    ev.preventDefault();
    textarea.value = next.text;
    textarea.setSelectionRange(next.selStart, next.selEnd);
  });
}
