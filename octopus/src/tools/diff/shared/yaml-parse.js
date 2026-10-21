// src/tools/diff/shared/yaml-parse.js — YAML 1.2 常用配置子集解析(ADR-0007)。
// 纯函数;子集外 kind:'unsupported'(锚点/别名/合并键/多文档/标签/复杂键/多行引号/flow 跨行/flow 键/
// 块标量显式缩进指示/非字符串形态键),语法错 kind:'syntax' 带行列;不推断 timestamp(裁定:视作字符串)。
// >2^53 走 JS number。子集内:单行引号标量('' 转义、反斜杠转义)、块标量 |/>(三态 chomping、折叠)、
// plain 多行折叠、单行 flow([…]/{…} 嵌套)。
// 结构:逐行游标走 raw 原文(收口点 A:块标量行不经空行/注释过滤,按原始行取——块标量内 # 是字面量);
// 块结构缩进算术(收口点 B):映射/序列按「行首空白数」定级,seq 项内容重写为
// 「dash 后首字符列」的虚拟行统一交 parseNode,seq-of-map 紧凑形与嵌套块由此自然成立。
const NULL_WORDS = new Set(['null', 'Null', 'NULL', '~']);
const BOOL_WORDS = { true: true, True: true, TRUE: true, false: false, False: false, FALSE: false };
const INT_RX = /^[-+]?[0-9]+$/;
const FLOAT_RX = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/;
const INF_NAN_RX = /^[-+]?\.(inf|Inf|INF)$|^[-+]?\.(nan|NaN|NAN)$/;
// 数字形态(拒为键用):int/float/inf-nan/bool/null 词——仅 plain 键受限,quoted 键豁免(parseMapKey)
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
    if (this.raw[this.raw.length - 1] === '') this.raw.pop(); // 尾 \n 的 split 残影非真行(块标量空行计数依赖此)
    this.endsNL = text.endsWith('\n'); // 源末是否有真换行(块标量 EOF 幻影换行判定,复审 D1)
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

// '#' 于串首或空白后才是注释(plain 标量内 a#b 不算);引号内 # 的豁免由 cutValueComment 收
function cutComment(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) return s.slice(0, i).trimEnd();
  }
  return s;
}

// —— 引号标量读取:s[i] 为引号;返回 { v, end }(end = 闭引号后一位)或 { unterminated }(行末未闭,
// 多行引号哨兵由调用方发)。单引号:仅 '' 转义;双引号:反斜杠转义表 + x/u/U 十六进制 ——
const DQ_ESC = {
  '0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029',
};
function readQuoted(s, i, l) {
  const q = s[i];
  let j = i + 1;
  let out = '';
  const col = (k) => l.indent + 1 + k;
  if (q === "'") {
    while (j < s.length) {
      if (s[j] === "'") {
        if (s[j + 1] === "'") { out += "'"; j += 2; continue; }
        return { v: out, end: j + 1 };
      }
      out += s[j++];
    }
    return { unterminated: true };
  }
  while (j < s.length) {
    if (s[j] === '"') return { v: out, end: j + 1 };
    if (s[j] === '\\') {
      const e = s[j + 1];
      if (e === undefined) return { unterminated: true };
      if (Object.hasOwn(DQ_ESC, e)) { out += DQ_ESC[e]; j += 2; continue; }
      const hexN = e === 'x' ? 2 : e === 'u' ? 4 : e === 'U' ? 8 : 0;
      if (hexN > 0) {
        const h = s.slice(j + 2, j + 2 + hexN);
        if (h.length < hexN) return { unterminated: true }; // 十六进制被行末截断 = 未闭合
        if (!/^[0-9a-fA-F]+$/.test(h)) throw new YErr('syntax', '引号标量非法转义', l.line, col(j));
        const cp = parseInt(h, 16);
        if (cp > 0x10ffff) throw new YErr('syntax', '引号标量转义越界', l.line, col(j));
        out += String.fromCodePoint(cp);
        j += 2 + hexN;
        continue;
      }
      throw new YErr('syntax', `引号标量非法转义 \\${e}`, l.line, col(j));
    }
    out += s[j++];
  }
  return { unterminated: true };
}

// 引号区终点扫描(只定位不验转义;注释裁剪用):闭引号后一位,行末未闭合 -1
function scanQuotedEnd(s, i) {
  const q = s[i];
  let j = i + 1;
  if (q === "'") {
    for (; j < s.length; j++) {
      if (s[j] === "'") {
        if (s[j + 1] === "'") { j++; continue; }
        return j + 1;
      }
    }
    return -1;
  }
  for (; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; } // 转义任吞一字符,合法性由 readQuoted 验
    if (s[j] === '"') return j + 1;
  }
  return -1;
}

// flow 值区终点扫描(引号感知,引号仅于项起位开启——项中引号是字面):闭括号后一位;
// -1 = 行末未闭合(交跨行哨兵);-2 = flow 内真注释截断(flow 必未闭于行末,同归跨行哨兵;真 YAML 亦拒)
function scanFlowEnd(s) {
  let depth = 0;
  let q = null;
  for (let j = 0; j < s.length; j++) {
    const ch = s[j];
    if (q !== null) {
      if (q === "'" && ch === "'") { if (s[j + 1] === "'") { j++; continue; } q = null; }
      else if (q === '"' && ch === '\\') j++;
      else if (q === '"' && ch === '"') q = null;
      continue;
    }
    if (ch === '#' && (j === 0 || s[j - 1] === ' ' || s[j - 1] === '\t')) return -2;
    if (ch === '"' || ch === "'") {
      let p = j - 1; // 引号于项起位开启:前一非空白字符为集合/逗号/冒号(冒号后空格不影响)
      while (p >= 0 && (s[p] === ' ' || s[p] === '\t')) p--;
      if (p < 0 || s[p] === '[' || s[p] === '{' || s[p] === ',' || s[p] === ':') q = ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') { depth--; if (depth === 0) return j + 1; }
  }
  return -1;
}

// 值位注释裁剪(引号让路):值首为引号时引号区内 # 不算注释,闭引号后照裁;
// 值首为 flow 时同扫至闭括号(括号内引号区豁免);两者未闭合则整段不裁(交各自哨兵);
// 值首非引号/flow 时同 cutComment(串中引号不开启引号态)
function cutValueComment(s) {
  const lead = /^[ \t]*/.exec(s)[0].length;
  const h = s[lead];
  if (h === '"' || h === "'") {
    const end = scanQuotedEnd(s, lead);
    if (end < 0) return { text: s, hadComment: false };
    const tailSrc = s.slice(end);
    const tail = cutComment(tailSrc);
    return { text: s.slice(0, end) + tail, hadComment: tail !== tailSrc };
  }
  if (h === '[' || h === '{') {
    const end = scanFlowEnd(s.slice(lead));
    if (end < 0) return { text: s, hadComment: false, flowTruncated: end === -2 };
    const abs = lead + end;
    const tailSrc = s.slice(abs);
    const tail = cutComment(tailSrc);
    return { text: s.slice(0, abs) + tail, hadComment: tail !== tailSrc };
  }
  const cut = cutComment(s);
  return { text: cut, hadComment: cut !== s };
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

// 导出供 norm-yaml plain-safe 判定同源复用(收口点 C:发射侧防再解析漂移)
export function scalarFromPlain(s) {
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

// 单行引号标量值:未闭合同行 → 多行引号哨兵(unsupported);闭引号后残余非注释 → 语法错
function quotedScalar(c, s, l) {
  const q = readQuoted(s, 0, l);
  if (q.unterminated) throw new YErr('unsupported', '多行引号标量子集外', l.line, l.indent + 1);
  if (s.slice(q.end).trim() !== '') throw new YErr('syntax', '引号标量后多余内容', l.line, l.indent + 1 + q.end);
  c.nextContent();
  return { t: 'str', v: q.v };
}

// plain 标量:含多行折叠(行并以空格,空行成换行;行尾注释即终结——注释后续行成孤儿交上层拒)
function parsePlain(c, s, l, parentIndent, hadComment) {
  let out = s;
  let pend = 0;
  if (!hadComment) {
    for (;;) {
      if (c.pos >= c.raw.length) break;
      const peek = c.load(c.pos);
      if (peek.text === '') { pend++; c.pos++; continue; } // 空行计入折叠换行
      if (peek.text[0] === '#') break; // 注释行:标量终结(不消耗,交 nextContent)
      if (peek.indent <= parentIndent) break; // 回容器层级:终结
      if (splitKey(peek.text)) throw new YErr('syntax', '值内含映射分隔(: )', peek.line, peek.indent + 1);
      out += (pend > 0 ? '\n'.repeat(pend) : ' ') + peek.text.replace(/[ \t]+$/, '');
      pend = 0;
      c.pos++;
    }
  }
  c.nextContent();
  return scalarFromPlain(out);
}

// —— 值分派(块映射值/裸标量文档共用):首字符定路;引号/flow/块标量此为真路径,余为哨兵 ——
// cv = cutValueComment 结果({ text, hadComment, flowTruncated? })
function parseValueText(c, s, l, parentIndent, cv) {
  const head = s[0];
  if (head === '&' || head === '*' || head === '!') {
    const hit = head === '&' ? '锚点' : head === '*' ? '别名' : '标签';
    throw new YErr('unsupported', `${hit}子集外`, l.line, l.indent + 1);
  }
  if (head === '|' || head === '>') return parseBlockScalar(c, parentIndent, s, l);
  if (head === '"' || head === "'") return quotedScalar(c, s, l);
  if (head === '[' || head === '{') {
    // flow 内注释截断 = flow 必未闭于行末,归跨行哨兵(真 YAML 亦拒,唯类目不同)
    if (cv.flowTruncated) throw new YErr('unsupported', 'flow 跨行(行末未闭合)子集外', l.line, l.indent + 1);
    const f = parseFlow(s, l);
    c.nextContent();
    return f;
  }
  if (s.startsWith('? ')) throw new YErr('unsupported', '复杂键子集外', l.line, l.indent + 1);
  if (splitKey(s)) throw new YErr('syntax', '值内含映射分隔(: )', l.line, l.indent + 1);
  return parsePlain(c, s, l, parentIndent, cv.hadComment);
}

// —— 块标量 | / >(收口点 A:内容行走 raw 原文,不经空行/注释过滤——块标量内 # 是字面量)——
// chomp 三态:clip 单尾换行 / strip 无尾换行 / keep 全保留;> 折叠:同行级行并以空格,
// 空行成换行,更深层行(n 缩进超出)前后断行不折叠、超出缩进按字面空格保留
function foldLines(lines) {
  const out = [];
  let cur = null;
  let pend = 0;
  let prevMore = false;
  for (const ln of lines) {
    if (ln === '') { pend++; continue; }
    const isMore = ln[0] === ' ';
    if (cur === null) {
      while (pend > 0) { out.push(''); pend--; } // 首行前空行 = 字面换行
      cur = ln;
    } else if (isMore || prevMore || pend > 0) {
      // 断行数:更深层行前后 = 空行数 + 1;否则 = 空行数
      out.push(cur);
      for (let k = (isMore || prevMore ? pend : pend - 1); k > 0; k--) out.push('');
      cur = ln;
      pend = 0;
    } else {
      cur += ' ' + ln;
    }
    prevMore = isMore;
  }
  if (cur !== null) out.push(cur);
  while (pend > 0) { out.push(''); pend--; } // 尾随空行交 chomping 裁决
  return out;
}

function parseBlockScalar(c, parentIndent, header, l) {
  let i = 1;
  let chomp = 'clip';
  let seenInd = false;
  for (; i < header.length; i++) {
    const h = header[i];
    if (h === '-' || h === '+') {
      if (seenInd) throw new YErr('syntax', '块标量指示重复', l.line, l.indent + 1);
      seenInd = true;
      chomp = h === '-' ? 'strip' : 'keep';
    } else if (h >= '0' && h <= '9') {
      throw new YErr('unsupported', '块标量显式缩进指示子集外', l.line, l.indent + 1);
    } else break;
  }
  if (cutComment(header.slice(i)).trim() !== '') throw new YErr('syntax', '块标量头后多余内容', l.line, l.indent + 1);
  const lines = [];
  let contentIndent = -1;
  let blanks = 0;
  while (c.pos < c.raw.length) {
    const ln = c.load(c.pos);
    if (ln.text === '') {
      if (contentIndent >= 0 && ln.indent > contentIndent) {
        // 深空白行 = 内容行(复审 D2):超出内容缩进的空格按字面保留,且拥有一条真实断行
        // (oracle:s: |\n  a\n   \n  b\n → 'a\n \nb\n';s: |\n  a\n   \n → 'a\n \n')
        while (blanks > 0) { lines.push(''); blanks--; }
        lines.push(' '.repeat(ln.indent - contentIndent));
      } else blanks++; // 空行(真空/等深或更浅空白行)先计数,见内容行才入列
      c.pos++; continue;
    }
    if (ln.indent <= parentIndent) break; // 容器层级回归:块终结
    if (contentIndent < 0) contentIndent = ln.indent; // 首个内容行定级
    else if (ln.indent < contentIndent) throw new YErr('syntax', '块标量行缩进不足', ln.line, ln.indent + 1);
    while (blanks > 0) { lines.push(''); blanks--; }
    lines.push(ln.indent > contentIndent ? ' '.repeat(ln.indent - contentIndent) + ln.text : ln.text);
    c.pos++;
  }
  if (chomp === 'keep') while (blanks > 0) { lines.push(''); blanks--; } // keep:尾随空行入值
  // EOF 幻影换行(复审 D1):末行无真换行则末断行不存在,不得追加。keep 的尾随空行行位由 join
  // 分隔符携带其前断行,缺的是它自身那条;clip 仅当末内容行后无任何行(无尾随空行)才缺断行——
  // 有尾随空行即末内容行断行真实存在,单尾 \n 照加(oracle:s: |\n  a → 'a';s: |+\n  a\n  → 'a\n\n';
  // s: |\n  a\n   → 'a\n ';s: |+\n  a\n → 'a\n')
  const noNL = c.pos >= c.raw.length && !c.endsNL && lines.length > 0;
  const body = header[0] === '>' ? foldLines(lines) : lines;
  let value;
  if (chomp === 'keep') value = body.length > 0 ? body.join('\n') + (noNL ? '' : '\n') : '';
  else {
    while (body.length > 0 && body[body.length - 1] === '') body.pop();
    value = chomp === 'strip' || body.length === 0 ? body.join('\n')
      : body.join('\n') + (noNL && blanks === 0 ? '' : '\n');
  }
  c.cur = c.pos < c.raw.length ? c.load(c.pos++) : null; // 终结行装回 cur,交上层循环
  return { t: 'str', v: value };
}

// —— 单行 flow([…] / {…}):嵌套/quoted 项与键/plain 项 1.2 推断;行末未闭合 = 跨行,拒 ——
function parseFlow(s, l) {
  let i = 0;
  const col = (k) => l.indent + 1 + k;
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++; };
  const atSep = (k) => k >= s.length || ' \t,]}'.includes(s[k]);
  const unclosed = () => new YErr('unsupported', 'flow 跨行(行末未闭合)子集外', l.line, l.indent + 1);
  // flow 内 plain 文本命中节点属性指示(锚点/别名/标签/复杂键)→ 与块路径同哨兵(复审 D3):
  // 真语义是节点属性,静默当字符串是错值,故拒(oracle:a: [&x] py=[null] 而非 '&x')
  const flowSentinel = (text, k) => {
    const hit = text[0] === '&' ? '锚点' : text[0] === '*' ? '别名' : text[0] === '!' ? '标签'
      : text.startsWith('? ') ? '复杂键' : null;
    if (hit) throw new YErr('unsupported', `${hit}子集外`, l.line, col(k));
  };
  // plain 项扫描:至项尾符;':' 后随空白/项尾才算键值分隔('a:b' 是词)
  function scanPlain() {
    while (i < s.length) {
      const ch = s[i];
      if (ch === ',' || ch === ']' || ch === '}') break;
      if (ch === ':' && atSep(i + 1)) break;
      if (ch === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) throw new YErr('syntax', 'flow 内注释截断', l.line, col(i));
      if (ch === '[' || ch === '{') throw new YErr('syntax', 'flow plain 项内错位起头', l.line, col(i));
      i++;
    }
  }
  function plainItem() {
    const start = i;
    scanPlain();
    const text = s.slice(start, i).replace(/[ \t]+$/, '');
    if (text === '') throw new YErr('syntax', 'flow 空项', l.line, col(start));
    flowSentinel(text, start);
    return scalarFromPlain(text);
  }
  function flowKey() {
    if (s[i] === '"' || s[i] === "'") {
      const q = readQuoted(s, i, l);
      if (q.unterminated) throw unclosed();
      i = q.end;
      return { v: q.v, quoted: true };
    }
    const start = i;
    scanPlain();
    const text = s.slice(start, i).replace(/[ \t]+$/, '');
    if (text === '') throw new YErr('syntax', 'flow 空键', l.line, col(start));
    flowSentinel(text, start);
    if (KEY_LIKE_NONSTR(text)) throw new YErr('unsupported', `非字符串形态键:${text}`, l.line, col(start));
    return { v: text, quoted: false };
  }
  const guardKey = (key, k) => {
    if (key === '') throw new YErr('unsupported', '空键(null 键)子集外', l.line, col(k));
    if (key === '<<') throw new YErr('unsupported', '合并键 << 子集外', l.line, col(k));
    if (key === '__proto__') throw new YErr('unsupported', '保留键 __proto__ 子集外', l.line, col(k));
  };
  function node() {
    ws();
    if (i >= s.length) throw unclosed();
    const ch = s[i];
    if (ch === '[') { i++; return flowSeq(); }
    if (ch === '{') { i++; return flowMap(); }
    if (ch === '"' || ch === "'") {
      const q = readQuoted(s, i, l);
      if (q.unterminated) throw unclosed();
      i = q.end;
      return { t: 'str', v: q.v };
    }
    return plainItem();
  }
  function flowSeq() {
    const items = [];
    ws();
    if (s[i] === ']') { i++; return { t: 'arr', v: items }; }
    for (;;) {
      const nStart = i;
      const n = node();
      const nq = s[nStart] === '"' || s[nStart] === "'"; // quoted 项起位(键引号态由引号本身记录)
      let item = n;
      ws();
      if (s[i] === ':' && (nq || atSep(i + 1))) { // [b: c] 单对映射;quoted 键后 JSON 形冒号(:1)容忍(复审 D4)
        const key = n.t === 'str' ? n.v : null;
        if (key === null) throw new YErr('unsupported', '非字符串形态键', l.line, col(i));
        guardKey(key, i);
        i++;
        item = { t: 'map', v: { [key]: node() } };
      }
      items.push(item);
      ws();
      if (s[i] === ',') { i++; ws(); if (s[i] === ']') { i++; return { t: 'arr', v: items }; } continue; }
      if (s[i] === ']') { i++; return { t: 'arr', v: items }; }
      if (i >= s.length) throw unclosed();
      throw new YErr('syntax', 'flow 序列项后期望 , 或 ]', l.line, col(i));
    }
  }
  function flowMap() {
    const o = {};
    ws();
    if (s[i] === '}') { i++; return { t: 'map', v: o }; }
    for (;;) {
      ws();
      const start = i;
      const kf = flowKey();
      const key = kf.v;
      guardKey(key, start);
      ws();
      let val = { t: 'null' }; // {x}:键无冒号 = null 值
      if (s[i] === ':' && (kf.quoted || atSep(i + 1))) { // quoted 键后 JSON 形冒号(:1)容忍(复审 D4);plain 键仍需空白/项尾
        i++;
        ws();
        val = s[i] === ',' || s[i] === '}' ? { t: 'null' } : node();
      }
      if (Object.hasOwn(o, key)) throw new YErr('syntax', `重复键:${key}`, l.line, col(start));
      o[key] = val;
      ws();
      if (s[i] === ',') { i++; ws(); if (s[i] === '}') { i++; return { t: 'map', v: o }; } continue; }
      if (s[i] === '}') { i++; return { t: 'map', v: o }; }
      if (i >= s.length) throw unclosed();
      throw new YErr('syntax', 'flow 映射项后期望 , 或 }', l.line, col(i));
    }
  }
  const v = node();
  ws();
  if (i < s.length) throw new YErr('syntax', 'flow 后多余内容', l.line, col(i));
  return v;
}

// 键/行首解析:引号起头 → 读完引号定键(quoted 键豁免非字符串形态门,守卫看最终去引号串);
// ':' 后随空白或行尾才算分隔;闭引号后非 : 起头 → 裸引号标量(残余须纯注释)
function parseMapKey(l) {
  const t = l.text;
  if (t[0] === '"' || t[0] === "'") {
    const q = readQuoted(t, 0, l);
    if (q.unterminated) throw new YErr('unsupported', '多行引号标量子集外', l.line, l.indent + 1);
    const after = t.slice(q.end);
    const m = /^[ \t]*:( |$|\t)/.exec(after);
    if (!m) {
      if (cutComment(after).trim() !== '') throw new YErr('syntax', '引号标量后多余内容', l.line, l.indent + 1 + q.end);
      return { scalar: q.v };
    }
    return { key: q.v, rest: after.slice(m[0].length), quoted: true };
  }
  const sp = splitKey(t);
  if (!sp) return null;
  if (sp.key[0] === '[' || sp.key[0] === '{') throw new YErr('unsupported', 'flow 键子集外', l.line, l.indent + 1);
  return { key: sp.key, rest: sp.rest, quoted: false };
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
// headerIndent:所在结构行(如 seq dash 行)的缩进,块标量/plain 续行以此定「更深」——
// 紧凑形虚拟行的列不等同真实结构缩进('- |' 内容只需深过 dash)
function parseNode(c, indent, headerIndent) {
  const l = c.cur;
  if (l.text === '---' || l.text === '...') throw new YErr('unsupported', '文档标记(---/...)子集外', l.line, l.indent + 1);
  rejectMarkerInline(l);
  if (isSeqItem(l.text)) return parseSeq(c, indent);
  if (l.text[0] === '"' || l.text[0] === "'") {
    const kp = parseMapKey(l);
    if (kp.scalar !== undefined) { c.nextContent(); return { t: 'str', v: kp.scalar }; } // 裸引号标量文档
    return parseMap(c, indent);
  }
  const lead = l.text[0] === '&' ? '锚点' : l.text[0] === '*' ? '别名' : l.text[0] === '!' ? '标签'
    : (l.text.startsWith('? ') || l.text === '?') ? '复杂键' : null;
  if (lead) throw new YErr('unsupported', `${lead}子集外`, l.line, l.indent + 1);
  if (l.text[0] === '[' || l.text[0] === '{') {
    // 行首 flow:先分「裸 flow 文档」与「flow 键」(闭括号后接键冒号);其余交 flow 真路径
    const fEnd = scanFlowEnd(l.text);
    const after = fEnd > 0 ? cutComment(l.text.slice(fEnd)).trim() : '';
    if (fEnd > 0 && /^:( |$|\t)/.test(after)) throw new YErr('unsupported', 'flow 键子集外', l.line, l.indent + 1);
    const cv = cutValueComment(l.text);
    return parseValueText(c, cv.text.trim(), l, headerIndent === undefined ? indent : headerIndent, cv);
  }
  if (splitKey(l.text)) return parseMap(c, indent);
  const cv = cutValueComment(l.text);
  return parseValueText(c, cv.text.trim(), l, headerIndent === undefined ? indent : headerIndent, cv);
}

function parseSeq(c, indent) {
  const items = [];
  for (;;) {
    const l = c.cur;
    if (!l || l.indent !== indent || !isSeqItem(l.text)) break;
    const after = l.text.slice(1);
    const stripped = after.replace(/^[ \t]+/, '');
    if (stripped === '') {
      // 空项:值挂更深块,否则 null(块标量/plain 续行以 dash 行缩进定级)
      c.nextContent();
      if (c.cur && c.cur.indent > indent) items.push(parseNode(c, c.cur.indent, indent));
      else items.push({ t: 'null' });
    } else {
      // 紧凑形(收口点 B):项内容重写为「dash 后首字符列」的虚拟行,统一交 parseNode——
      // seq-of-map / 嵌套 seq / 字面标量三态由此同一走线;块标量/plain 续行以 dash 行缩进定级
      const contentCol = l.indent + 1 + (after.length - stripped.length);
      c.cur = { text: stripped, indent: contentCol, line: l.line };
      items.push(parseNode(c, contentCol, l.indent));
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
    const kp = parseMapKey(l);
    if (!kp) break; // 非映射行:交文档级裁决(多余内容/缩进无父)
    const key = kp.quoted ? kp.key : kp.key.trim(); // quoted 键保真(与 flow {'" k "': 1} 同值同文)
    if (key === '') throw new YErr('unsupported', '空键(null 键)子集外', l.line, l.indent + 1);
    if (key === '<<') throw new YErr('unsupported', '合并键 << 子集外', l.line, l.indent + 1);
    if (!kp.quoted && KEY_LIKE_NONSTR(key)) throw new YErr('unsupported', `非字符串形态键:${key}`, l.line, l.indent + 1);
    if (key === '__proto__') throw new YErr('unsupported', '保留键 __proto__ 子集外', l.line, l.indent + 1);
    const cv = cutValueComment(kp.rest);
    const valText = cv.text.trim();
    let value;
    if (valText !== '') {
      value = parseValueText(c, valText, l, indent, cv);
    } else {
      // 空值:更深块为其值;同缩进序列项亦为其值(YAML 併格形);否则 null
      // (块标量/plain 续行以映射缩进定级——'a:\n  |' 内容深过 a 即可,不必深过标头)
      c.nextContent();
      if (c.cur && c.cur.indent > indent) value = parseNode(c, c.cur.indent, indent);
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
