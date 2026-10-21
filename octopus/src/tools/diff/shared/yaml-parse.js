// src/tools/diff/shared/yaml-parse.js — YAML 1.2 常用配置子集解析(ADR-0007)。
// 纯函数;子集外 kind:'unsupported'(锚点/别名/合并键/多文档/标签/复杂键/引号标量/flow/块标量/非字符串形态键),
// 语法错 kind:'syntax' 带行列;不推断 timestamp(裁定:视作字符串)。>2^53 走 JS number。
// 结构:逐行游标走 raw 原文(收口点 A:块标量行不经空行/注释过滤,Task 2 按原始行取);
// 块结构缩进算术(收口点 B):映射/序列按「行首空白数」定级,seq 项内容重写为
// 「dash 后首字符列」的虚拟行统一交 parseNode,seq-of-map 紧凑形与嵌套块由此自然成立。
const NULL_WORDS = new Set(['null', 'Null', 'NULL', '~']);
const BOOL_WORDS = { true: true, True: true, TRUE: true, false: false, False: false, FALSE: false };
const INT_RX = /^[-+]?[0-9]+$/;
const FLOAT_RX = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/;
const INF_NAN_RX = /^[-+]?\.(inf|Inf|INF)$|^[-+]?\.(nan|NaN|NAN)$/;
// 数字形态(拒为键用):int/float/inf-nan/bool/null 词——quoted 键不受限(Task 2 引号标量落地时豁免)
// hasOwn 判定:『in』会撞上 Object.prototype(如键 'constructor' 被误判 bool 形态)
const KEY_LIKE_NONSTR = (s) => INT_RX.test(s) || FLOAT_RX.test(s) || INF_NAN_RX.test(s)
  || Object.hasOwn(BOOL_WORDS, s) || NULL_WORDS.has(s);

class YErr extends Error {
  constructor(kind, msg, line, col) { super(msg); this.kind = kind; this.line = line; this.col = col; }
}

// —— 游标:每行 { text, indent, line };text 已剥缩进与行尾 \r(CRLF 归一,同 toml-parse:
// 换行风格是写法差异,不进值树);tab 于缩进 = 语法错,纯空白行视作空行不拒 ——
class Cursor {
  constructor(text) {
    this.raw = text.split('\n');
    this.pos = 0;
    this.cur = null; // 当前待解析行(seq 紧凑形会重写为虚拟行)
  }
  load(i) {
    const s0 = this.raw[i];
    const s = s0.endsWith('\r') ? s0.slice(0, -1) : s0;
    let j = 0;
    while (j < s.length && s[j] === ' ') j++;
    if (s[j] === '\t') {
      let k = j;
      while (k < s.length && (s[k] === '\t' || s[k] === ' ')) k++;
      if (k < s.length) throw new YErr('syntax', '缩进含制表符', i + 1, j + 1);
      return { text: '', indent: 0, line: i + 1 }; // 纯空白行视作空行
    }
    return { text: s.slice(j), indent: j, line: i + 1 };
  }
  nextContent() {
    while (this.pos < this.raw.length) {
      const l = this.load(this.pos++);
      if (l.text === '' || l.text.startsWith('#')) continue; // 空行/纯注释(text 已剥缩进,# 于行首必为注释)
      this.cur = l;
      return true;
    }
    this.cur = null;
    return false;
  }
}

// '#' 于串首或空白后才是注释(plain 标量内 a#b 不算);引号内 # 的豁免在 Task 2 引号落地时收
function cutComment(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) return s.slice(0, i).trimEnd();
  }
  return s;
}

// 序列项:'-' 独占或 '- ' 起头('-foo' 是 plain 标量,非项)
const isSeqItem = (text) => text === '-' || text.startsWith('- ');

// 键扫描:首个「后随空白或行尾」的 ':' 为键值分隔;'a:b'/'http://x' 非映射行
function splitKey(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ':' && (i + 1 === text.length || text[i + 1] === ' ' || text[i + 1] === '\t')) {
      return { key: text.slice(0, i), rest: text.slice(i + 1) };
    }
  }
  return null;
}

function scalarFromPlain(s) {
  if (Object.hasOwn(BOOL_WORDS, s)) return { t: 'bool', v: BOOL_WORDS[s] };
  if (NULL_WORDS.has(s)) return { t: 'null' };
  if (INT_RX.test(s)) return { t: 'int', v: Number(s) };
  if (FLOAT_RX.test(s)) return { t: 'float', v: Number(s) };
  if (INF_NAN_RX.test(s)) {
    if (/nan/i.test(s.slice(1))) return { t: 'float', v: NaN };
    return { t: 'float', v: s.startsWith('-') ? -Infinity : Infinity };
  }
  return { t: 'str', v: s };
}

// —— 值哨兵(行首/值首命中即拒,子集外诚实上报;引号/flow/块标量归后续任务)——
function plainValue(s, l) {
  const hit = s[0] === '&' ? '锚点' : s[0] === '*' ? '别名' : s[0] === '!' ? '标签'
    : (s[0] === '[' || s[0] === '{') ? 'flow 集合' : (s[0] === '|' || s[0] === '>') ? '块标量'
    : (s[0] === '"' || s[0] === "'") ? '引号标量' : null;
  if (hit) throw new YErr('unsupported', `${hit}子集外`, l.line, l.indent + 1);
  if (s.startsWith('? ')) throw new YErr('unsupported', '复杂键子集外', l.line, l.indent + 1);
  if (splitKey(s)) throw new YErr('syntax', '值内含映射分隔(: )', l.line, l.indent + 1);
  return scalarFromPlain(s);
}

// 文档标记识别(text 已剥缩进;容行尾空白/行尾注释)
const marker = (l) => cutComment(l.text).trim();

// 文档标记同行带内容('--- k: v' / '... k: v'):真 YAML 为「文档起 + 同行节点」,子集外拒——
// 不拒会落 splitKey 成 '--- k' 形态键(静默错值);裸标记 + 行尾空白/行尾注释不算(仍归文档头/尾)
function rejectMarkerInline(l) {
  const t = l.text;
  if ((t.startsWith('---') || t.startsWith('...')) && (t[3] === ' ' || t[3] === '\t')
    && cutComment(t.slice(4)).replace(/^[ \t]+/, '') !== '') {
    throw new YErr('unsupported', '文档标记同行内容子集外', l.line, l.indent + 1);
  }
}

// —— 块节点:cur 已装入本块首行。返回值后 cur = 下一未解析内容行(或 null)——
function parseNode(c, indent) {
  const l = c.cur;
  if (l.text === '---' || l.text === '...') throw new YErr('unsupported', '文档标记(---/...)子集外', l.line, l.indent + 1);
  rejectMarkerInline(l);
  if (isSeqItem(l.text)) return parseSeq(c, indent);
  const lead = l.text[0] === '&' ? '锚点' : l.text[0] === '*' ? '别名' : l.text[0] === '!' ? '标签'
    : (l.text.startsWith('? ') || l.text === '?') ? '复杂键' : null;
  if (lead) throw new YErr('unsupported', `${lead}子集外`, l.line, l.indent + 1);
  if (splitKey(l.text)) return parseMap(c, indent);
  const v = plainValue(cutComment(l.text).trim(), l); // 裸标量文档(单行;多行 plain 标量归后续任务)
  c.nextContent();
  return v;
}

function parseSeq(c, indent) {
  const items = [];
  for (;;) {
    const l = c.cur;
    if (!l || l.indent !== indent || !isSeqItem(l.text)) break;
    const after = l.text.slice(1);
    const stripped = after.replace(/^[ \t]+/, '');
    if (stripped === '') {
      // 空项:值挂更深块,否则 null
      c.nextContent();
      if (c.cur && c.cur.indent > indent) items.push(parseNode(c, c.cur.indent));
      else items.push({ t: 'null' });
    } else {
      // 紧凑形(收口点 B):项内容重写为「dash 后首字符列」的虚拟行,统一交 parseNode——
      // seq-of-map / 嵌套 seq / 字面标量三态由此同一走线
      const contentCol = l.indent + 1 + (after.length - stripped.length);
      c.cur = { text: stripped, indent: contentCol, line: l.line };
      items.push(parseNode(c, contentCol));
    }
  }
  return { t: 'arr', v: items };
}

function parseMap(c, indent) {
  const o = {};
  for (;;) {
    const l = c.cur;
    if (!l || l.indent !== indent || isSeqItem(l.text)) break;
    rejectMarkerInline(l);
    const sp = splitKey(l.text);
    if (!sp) break; // 非映射行:交文档级裁决(多余内容/缩进无父)
    const key = sp.key.trim();
    if (key === '') throw new YErr('unsupported', '空键(null 键)子集外', l.line, l.indent + 1);
    if (key === '<<') throw new YErr('unsupported', '合并键 << 子集外', l.line, l.indent + 1);
    if (KEY_LIKE_NONSTR(key)) throw new YErr('unsupported', `非字符串形态键:${key}`, l.line, l.indent + 1);
    if (key === '__proto__') throw new YErr('unsupported', '保留键 __proto__ 子集外', l.line, l.indent + 1);
    const valText = cutComment(sp.rest).trim();
    let value;
    if (valText !== '') {
      value = plainValue(valText, l);
      c.nextContent();
    } else {
      // 空值:更深块为其值;同缩进序列项亦为其值(YAML 併格形);否则 null
      c.nextContent();
      if (c.cur && c.cur.indent > indent) value = parseNode(c, c.cur.indent);
      else if (c.cur && c.cur.indent === indent && isSeqItem(c.cur.text)) value = parseSeq(c, indent);
      else value = { t: 'null' };
    }
    if (Object.hasOwn(o, key)) throw new YErr('syntax', `重复键:${key}`, l.line, l.indent + 1);
    o[key] = value;
  }
  return { t: 'map', v: o };
}

export function parseYaml(text) {
  try {
    const c = new Cursor(text);
    c.nextContent();
    if (c.cur && c.cur.indent === 0 && marker(c.cur) === '---') c.nextContent(); // 文档头恰一个剥除
    let value = { t: 'null' };
    if (c.cur && !(c.cur.indent === 0 && marker(c.cur) === '...')) value = parseNode(c, c.cur.indent);
    if (c.cur) {
      const l = c.cur;
      if (l.indent === 0 && marker(l) === '...') {
        // 文档尾剥除:其后仅容空行/纯注释;再现实内容(含 '---' 二现)= 多文档,拒
        while (c.pos < c.raw.length) {
          const n = c.load(c.pos++);
          if (n.text === '' || n.text.startsWith('#')) continue;
          throw new YErr('unsupported', '多文档子集外', n.line, n.indent + 1);
        }
      } else if (l.indent === 0 && marker(l) === '---') throw new YErr('unsupported', '多文档子集外', l.line, 1);
      else if (l.indent > 0) throw new YErr('syntax', '缩进无父容器可挂', l.line, l.indent + 1);
      else throw new YErr('syntax', '期望 key: value、序列项或文档结束', l.line, l.indent + 1);
    }
    return { ok: true, value };
  } catch (e) {
    if (e instanceof YErr) return { ok: false, reason: { kind: e.kind, line: e.line, col: e.col, detail: e.message } };
    throw e; // 非受控错(如深层嵌套 RangeError)原样上抛,缝处 Task 4 接
  }
}
