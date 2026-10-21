// src/tools/diff/shared/toml-parse.js — TOML 1.0 全谱解析(ADR-0007):text → 带类型标签值树。
// 纯函数,零依赖;语法错自控行列(kind:'syntax')。>2^53 整数走 JS number(已知限制,同 JSON)。
// 值模型:int/float/bool/str/odt/ldt/ld/lt/arr/tbl;odt 在此归 UTC Z(t/z 归大写)。
const BARE_KEY = /^[A-Za-z0-9_-]+/;
const RX_ODT = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(?:[Zz]|([+-]\d{2}):(\d{2}))/;
const RX_LDT = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(\.\d+)?/;
const RX_LD = /^(\d{4})-(\d{2})-(\d{2})/;
const RX_LT = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?/;
const RX_FLOAT = /^[+-]?(inf|nan|0|[1-9][0-9_]*|0[0-9_]+)(\.[0-9_]+)?([eE][+-]?[0-9_]+)?$/;
const RX_INT_BODY = /^(0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|[0-9_]+)$/;

class P {
  constructor(src) {
    this.s = src;
    this.i = 0;
    this.line = 1;
    this.lineStart = 0;
  }
  col() { return this.i - this.lineStart; }
  err(msg) {
    return { ok: false, reason: { kind: 'syntax', line: this.line, col: this.col() + 1, detail: msg } };
  }
  peek() { return this.s[this.i]; }
  take() {
    const c = this.s[this.i++];
    if (c === '\n') { this.line++; this.lineStart = this.i; }
    return c;
  }
  eof() { return this.i >= this.s.length; }
  // 跳过空格与制表(不跨行)
  skipSp() { while (this.peek() === ' ' || this.peek() === '\t') this.i++; }
  // 行尾:空白 + 可选注释 + 换行(LF 或 CRLF);非此形态即错
  endOfLine() {
    this.skipSp();
    if (this.peek() === '#') while (!this.eof() && this.peek() !== '\n') this.i++;
    if (this.eof()) return true;
    const c = this.take();
    if (c === '\n') return true;
    if (c === '\r') return this.take() === '\n'; // CRLF 合法;裸 \r 落此即 false
    return false;
  }
  match(rx) { const m = rx.exec(this.s.slice(this.i)); if (m) this.i += m[0].length; return m; }
}

function isWsCh(c) { return c === ' ' || c === '\t'; }

// —— 日期时间:字段算术归 UTC(不依赖 Date),闰秒 :60 原样随秒位保留 ——
function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [y + (m <= 2 ? 1 : 0), m, d];
}
const p2 = (n) => String(n).padStart(2, '0');

// 分支按各 RX 匹配数组长度判(JS 正则未参与的捕获组也占位):
// RX_LD len 4 / RX_LT len 5 / RX_LDT len 8 / RX_ODT len 10(Z 命中时组 8/9 为 undefined 但占位)。
function canonDateTime(p) {
  if (p.length === 4) return `${p[1]}-${p[2]}-${p[3]}`; // ld
  if (p.length === 5) return `${p[1]}:${p[2]}:${p[3]}${p[4] ?? ''}`; // lt:组 4 = 带点分数,原文保留(尾零发射层修)
  const [Y, Mo, D] = [Number(p[1]), Number(p[2]), Number(p[3])];
  const h = Number(p[4]);
  const mi = Number(p[5]);
  const sec = p[6]; // 秒原文(闰秒 :60 原样)
  const frac = p[7] ?? ''; // 带点分数原文保留
  if (p.length === 10) { // odt:组 8 = 带符号小时,组 9 = 分钟;Z 命中按 0 偏移同路算术
    const offMin = p[8] === undefined ? 0
      : (p[8].startsWith('-') ? -1 : 1) * (Math.abs(Number(p[8])) * 60 + Number(p[9]));
    const total = daysFromCivil(Y, Mo, D) * 1440 + h * 60 + mi - offMin;
    const days = Math.floor(total / 1440);
    const rem = total - days * 1440;
    const [y2, m2, d2] = civilFromDays(days);
    return `${y2}-${p2(m2)}-${p2(d2)}T${p2(rem / 60 | 0)}:${p2(rem % 60)}:${sec}${frac}Z`;
  }
  return `${p[1]}-${p[2]}-${p[3]}T${p[4]}:${p[5]}:${sec}${frac}`; // ldt:分隔归一为大写 T
}

// —— 字符串四式 ——
function parseBasicString(p, multiline) {
  // 入口:p 已过开引号
  let out = '';
  for (;;) {
    if (p.eof()) return p.err('字符串未闭合');
    const c = p.peek();
    if (c === '"') {
      if (!multiline) { p.i++; return { ok: true, v: out }; }
      if (p.s.slice(p.i, p.i + 3) === '"""') { p.i += 3; return { ok: true, v: out }; }
      p.i++; out += '"';
      continue;
    }
    if (c === '\n') {
      if (!multiline) return p.err('单行串含换行');
      p.take(); out += '\n';
      continue;
    }
    if (c === '\r' && multiline) {
      // CRLF 归一为 \n(换行风格是写法差异,不进值树);裸 \r 非法
      if (p.s[p.i + 1] !== '\n') return p.err('多行串含裸回车');
      p.take(); p.take(); out += '\n';
      continue;
    }
    if (c === '\\') {
      p.i++;
      const e = p.take();
      if (e === 'b') out += '\b';
      else if (e === 't') out += '\t';
      else if (e === 'n') out += '\n';
      else if (e === 'f') out += '\f';
      else if (e === 'r') out += '\r';
      else if (e === '"') out += '"';
      else if (e === '\\') out += '\\';
      else if (e === 'u' || e === 'U') {
        const n = e === 'u' ? 4 : 8;
        const hex = p.s.slice(p.i, p.i + n);
        if (!/^[0-9A-Fa-f]+$/.test(hex)) return p.err('非法 unicode 转义');
        p.i += n;
        out += String.fromCodePoint(parseInt(hex, 16));
      } else if (multiline && (e === '\n' || isWsCh(e) || e === '\r')) {
        // 行尾反斜杠:连同换行吞到下一行非空白(TOML 1.0:含换行在内一并裁去)
        p.i--;
        while (!p.eof()) {
          if (p.peek() === '\r' && p.s[p.i + 1] === '\n') { p.take(); p.take(); continue; }
          if (isWsCh(p.peek()) || p.peek() === '\n') { p.take(); continue; }
          break;
        }
        continue;
      } else return p.err(`非法转义 \\${e}`);
      continue;
    }
    if (!multiline && c !== '\t' && c.charCodeAt(0) < 0x20) return p.err('单行串含控制字符');
    p.i++; out += c;
  }
}

function parseLiteralString(p, multiline) {
  let out = '';
  for (;;) {
    if (p.eof()) return p.err('字符串未闭合');
    const c = p.peek();
    if (c === "'") {
      if (!multiline) { p.i++; return { ok: true, v: out }; }
      if (p.s.slice(p.i, p.i + 3) === "'''") { p.i += 3; return { ok: true, v: out }; }
      p.i++; out += "'";
      continue;
    }
    if (c === '\n' && !multiline) return p.err('单行串含换行');
    if (c === '\r' && multiline) {
      // CRLF 归一为 \n;裸 \r 非法
      if (p.s[p.i + 1] !== '\n') return p.err('多行串含裸回车');
      p.take(); p.take(); out += '\n';
      continue;
    }
    if (c !== '\t' && c !== '\n' && c.charCodeAt(0) < 0x20) return p.err('字面串含控制字符');
    p.take(); out += c;
  }
}

function firstNewlineTrim(p) {
  // 多行串开定界后紧跟的换行被裁剪(定界已消费;CRLF 归一同裁)
  if (p.peek() === '\r' && p.s[p.i + 1] === '\n') { p.take(); p.take(); }
  else if (p.peek() === '\n') p.take();
}

// —— 值 ——
// 串解析器返回裸串(键路径也复用它);值位置在此补 {t:'str'} 标签
function strVal(r) { return r.ok ? { ok: true, v: { t: 'str', v: r.v } } : r; }

function parseValue(p) {
  p.skipSp();
  const c = p.peek();
  if (c === '"') {
    if (p.s.slice(p.i, p.i + 3) === '"""') { p.i += 3; firstNewlineTrim(p); return strVal(parseBasicString(p, true)); }
    p.i++; return strVal(parseBasicString(p, false));
  }
  if (c === "'") {
    if (p.s.slice(p.i, p.i + 3) === "'''") { p.i += 3; firstNewlineTrim(p); return strVal(parseLiteralString(p, true)); }
    p.i++; return strVal(parseLiteralString(p, false));
  }
  if (c === 't' && p.match(/^true\b/)) return { ok: true, v: { t: 'bool', v: true } };
  if (c === 'f' && p.match(/^false\b/)) return { ok: true, v: { t: 'bool', v: false } };
  if (c === '[') return parseArray(p);
  if (c === '{') return parseInline(p);
  return parseAtom(p);
}

function parseArray(p) {
  p.i++; // [
  const items = [];
  for (;;) {
    skipWsAndComments(p);
    if (p.eof()) return p.err('数组未闭合');
    if (p.peek() === ']') { p.i++; return { ok: true, v: { t: 'arr', v: items } }; }
    const r = parseValue(p);
    if (!r.ok) return r;
    items.push(r.v);
    skipWsAndComments(p);
    if (p.peek() === ',') { p.i++; continue; }
    if (p.peek() === ']') { p.i++; return { ok: true, v: { t: 'arr', v: items } }; }
    return p.err('数组元素后期望 , 或 ]');
  }
}

function skipWsAndComments(p) {
  for (;;) {
    const c = p.peek();
    if (c === ' ' || c === '\t' || c === '\n') { p.take(); continue; }
    if (c === '\r' && p.s[p.i + 1] === '\n') { p.take(); p.take(); continue; } // 裸 \r 不跳,交下游拒
    if (c === '#') { while (!p.eof() && p.peek() !== '\n') p.i++; continue; }
    return;
  }
}

// 内联表:TOML 1.0 单行(不允许换行)
function parseInline(p) {
  p.i++; // {
  const o = {};
  p.skipSp();
  if (p.peek() === '}') { p.i++; return { ok: true, v: { t: 'tbl', v: o } }; }
  for (;;) {
    p.skipSp();
    const kp = parseKeyPath(p);
    if (!kp.ok) return kp;
    if (p.peek() !== '=') return p.err('内联表期望 =');
    p.i++;
    const vr = parseValue(p);
    if (!vr.ok) return vr;
    const at = walk(o, kp.v.slice(0, -1), true);
    if (!at.ok) return at;
    const last = kp.v[kp.v.length - 1];
    if (at.v[last] !== undefined) return p.err('内联表重键');
    at.v[last] = vr.v;
    p.skipSp();
    if (p.peek() === ',') { p.i++; continue; }
    if (p.peek() === '}') { p.i++; return { ok: true, v: { t: 'tbl', v: o } }; }
    return p.err('内联表后期望 , 或 }(1.0 内联表不跨行)');
  }
}

// 点键路径:裸键/基本串键/字面串键,以 . 分隔
function parseKeyPath(p) {
  const keys = [];
  for (;;) {
    p.skipSp();
    if (p.peek() === '"') {
      p.i++;
      const r = parseBasicString(p, false);
      if (!r.ok) return r;
      keys.push(r.v);
    } else if (p.peek() === "'") {
      p.i++;
      const r = parseLiteralString(p, false);
      if (!r.ok) return r;
      keys.push(r.v);
    } else {
      const m = p.match(BARE_KEY);
      if (!m) return p.err('期望键');
      keys.push(m[0]);
    }
    p.skipSp();
    if (p.peek() === '.') { p.i++; continue; }
    return { ok: true, v: keys };
  }
}

// 数字/日期原子:RX 顺序即消歧(ODT→LDT→LD→LT→数字)
function parseAtom(p) {
  const rest = p.s.slice(p.i);
  let m = RX_ODT.exec(rest);
  if (m) { p.i += m[0].length; return { ok: true, v: { t: 'odt', v: canonDateTime(m) } }; }
  m = RX_LDT.exec(rest);
  if (m) { p.i += m[0].length; return { ok: true, v: { t: 'ldt', v: canonDateTime(m) } }; }
  m = RX_LD.exec(rest);
  if (m && !/^[\d-]*\d-\d/.test(rest.slice(m[0].length)) && !/[.:]/.test(rest[m[0].length] ?? '')) {
    p.i += m[0].length; return { ok: true, v: { t: 'ld', v: canonDateTime(m) } };
  }
  m = RX_LT.exec(rest);
  if (m) { p.i += m[0].length; return { ok: true, v: { t: 'lt', v: canonDateTime(m) } }; }
  // 数字:取最长相邻片段再整段校验(下划线在串内合法;+− 入字符类以容指数符号,如 -2E-2)
  const lex = /^[+-]?[0-9A-Za-z_.+-]+/.exec(rest);
  if (!lex) return p.err('无法识别的值');
  const tok = lex[0];
  if (tok === 'inf' || tok === '+inf' || tok === '-inf' || tok === 'nan' || tok === '+nan' || tok === '-nan') {
    p.i += tok.length;
    const neg = tok.startsWith('-');
    if (tok.replace(/^[+-]/, '') === 'inf') return { ok: true, v: { t: 'float', v: neg ? -Infinity : Infinity } };
    return { ok: true, v: { t: 'float', v: NaN } };
  }
  const body = tok.replace(/^[+-]/, '');
  if (RX_INT_BODY.test(body)) { // 整数先判:RX_FLOAT 的整数臂会误吞 1_000 为 float
    if (/^\d/.test(body) && /^0[0-9_]/.test(body)) return p.err('前导零非法');
    p.i += tok.length;
    let v;
    if (body.startsWith('0x')) v = parseInt(body.slice(2).replace(/_/g, ''), 16);
    else if (body.startsWith('0o')) v = parseInt(body.slice(2).replace(/_/g, ''), 8);
    else if (body.startsWith('0b')) v = parseInt(body.slice(2).replace(/_/g, ''), 2);
    else v = Number(body.replace(/_/g, ''));
    if (tok.startsWith('-')) v = -v; // body 已剥符号,负号在此补回
    return { ok: true, v: { t: 'int', v } };
  }
  if (RX_FLOAT.test(tok)) {
    if (/^0[0-9_]/.test(tok.replace(/^[+-]/, ''))) return p.err('前导零非法');
    p.i += tok.length;
    return { ok: true, v: { t: 'float', v: Number(tok.replace(/_/g, '')) } };
  }
  return p.err(`无法识别的值:${tok}`);
}

// 沿点键走表;dotted=true 时创建中间表并以节点引用记入 dotted 集
//(表头沿途的隐式超表不记,允许其后补 [a] 显式定义)
// aotDescend(仅表头路径):遇数组表(aot 集)下钻到其最后元素(元素须全为表);
// 点键值路径不穿数组表(对齐参考实现:同名前缀在当前表内新嵌套,撞到时按标量占位拒)
function walk(obj, path, dottedCreate, sets, aotDescend) {
  let cur = obj;
  for (const k of path) {
    if (cur[k] === undefined) {
      cur[k] = { t: 'tbl', v: {} };
      if (dottedCreate && sets) sets.dotted.add(cur[k]);
    } else if (cur[k].t === 'arr') {
      const els = cur[k].v;
      if (aotDescend && sets && sets.aot.has(cur[k]) && els.length && els.every((e) => e.t === 'tbl')) {
        cur = els[els.length - 1].v; // 数组表下钻:子表挂最近定义的元素
        continue;
      }
      return { ok: false, why: '标量占位' };
    } else if (cur[k].t !== 'tbl') return { ok: false, why: '标量占位' };
    else if (sets && sets.inlined.has(cur[k])) return { ok: false, why: '内联表闭合' };
    cur = cur[k].v;
  }
  return { ok: true, v: cur };
}

export function parseToml(text) {
  const p = new P(text);
  const root = { t: 'tbl', v: {} };
  // 集合均以节点引用(对象身份)记账:explicit=已显式定义表;dotted=点键创建表;inlined=内联表;aot=[[..]]建的数组表
  const sets = { explicit: new Set(), dotted: new Set(), inlined: new Set(), aot: new Set() };
  let cur = root.v;
  for (;;) {
    skipWsAndComments(p);
    if (p.eof()) return { ok: true, value: root };
    if (p.peek() === '[') {
      const isArr = p.s[p.i + 1] === '[';
      p.i += isArr ? 2 : 1;
      const kp = parseKeyPath(p);
      if (!kp.ok) return kp;
      p.skipSp();
      if (p.peek() !== ']') return p.err('表头未闭合');
      p.i += isArr ? 2 : 1;
      if (!p.endOfLine()) return p.err('表头后有多余内容');
      const keys = kp.v;
      const parent = walk(root.v, keys.slice(0, -1), false, sets, true);
      if (!parent.ok) return p.err(parent.why);
      const last = keys[keys.length - 1];
      const pv = parent.v;
      if (isArr) {
        if (pv[last] === undefined) { pv[last] = { t: 'arr', v: [] }; sets.aot.add(pv[last]); }
        else {
          if (pv[last].t !== 'arr') return p.err('数组表撞非数组');
          // 仅 [[..]] 建的数组可扩;内联数组(a=[{..}])是闭合写法,不可追加
          if (!sets.aot.has(pv[last])) return p.err('数组表撞内联数组');
        }
        const el = { t: 'tbl', v: {} };
        pv[last].v.push(el);
        cur = el.v;
      } else {
        if (pv[last] === undefined) pv[last] = { t: 'tbl', v: {} };
        else {
          const node = pv[last];
          if (node.t !== 'tbl') return p.err('表头撞标量');
          if (sets.inlined.has(node)) return p.err('内联表闭合'); // 内联表闭合并:显式表头不得并入
          if (sets.explicit.has(node) || sets.dotted.has(node)) return p.err('重复定义表');
          // 隐式 super-table 后补定义:允许
        }
        sets.explicit.add(pv[last]);
        cur = pv[last].v;
      }
      continue;
    }
    // 键值行
    const kp = parseKeyPath(p);
    if (!kp.ok) return kp;
    p.skipSp();
    if (p.peek() !== '=') return p.err('期望 =');
    p.i++;
    const vr = parseValue(p);
    if (!vr.ok) return vr;
    if (vr.v.t === 'tbl') sets.inlined.add(vr.v);
    const at = walk(cur, kp.v.slice(0, -1), true, sets);
    if (!at.ok) return p.err(at.why);
    const last = kp.v[kp.v.length - 1];
    if (at.v[last] !== undefined) return p.err('重复键');
    at.v[last] = vr.v;
    if (!p.endOfLine()) return p.err('行尾有多余内容');
  }
}
