// src/tools/diff/shared/norm-toml.js — TOML 归一化器(ADR-0007):parseToml 值树 → 规范形文本。
// 值等价⇒文本等价:点键/内联表已由解析摊平,发射层做键码点排序、四式串收敛基本串、
// 数组恒多行、表体不缩进、日期时间分数尾零修剪;-0 归 0、inf/nan 发裸形。幂等由「同值同文本」保证。
import { parseToml } from './toml-parse.js';
import { cmpCodePoints } from './codepoint.js';

const BARE = /^[A-Za-z0-9_-]+$/;

const ESC = { '\\': '\\\\', '"': '\\"', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
function escChar(c) {
  if (ESC[c]) return ESC[c];
  const cp = c.codePointAt(0);
  if (cp < 0x20 || cp === 0x7f) return '\\u' + cp.toString(16).padStart(4, '0');
  return c;
}

const emitBasic = (s) => '"' + [...s].map(escChar).join('') + '"';

function emitStr(s) {
  if (!s.includes('\n')) return emitBasic(s);
  // 多行定稿(载体式收正,探针实证):发「"""\n 内容原文 """」。开定界后的载体换行
  // 重解析必被裁,内容即值原文,绝不补人工尾换行;值自身不以 \n 结尾时闭定界符紧随
  // 末字符,以 \n 结尾时该换行紧贴闭定界符(合法且保值)。同值同文本,幂等平凡成立。
  // 内容换行一律字面," 与 \ 走 escChar(防撞定界/行尾反斜杠歧义),其余控制符 \u 转义。
  return '"""\n' + [...s].map((c) => (c === '\n' ? '\n' : escChar(c))).join('') + '"""';
}

function emitKey(k) { return BARE.test(k) ? k : emitStr(k); }

function emitFloat(n) {
  if (Number.isNaN(n)) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  if (Object.is(n, -0)) n = 0;
  let s = String(n);
  if (!/[.eE]/.test(s)) s += '.0';
  return s.replace('e+', 'e');
}

// 分数尾零修剪(解析器原文保留,发射层修):'.500'→'.5';全零 '.000' 连点删去;odt 的 Z 尾保留
const trimFrac = (s) => s.replace(/\.(\d*?)0+(?=Z?$)/, (m, digits) => (digits === '' ? '' : '.' + digits));

function emitValue(v, indent, inline = false) {
  switch (v.t) {
    case 'int': return String(v.v);
    case 'float': return emitFloat(v.v);
    case 'bool': return String(v.v);
    case 'str': return inline ? emitBasic(v.v) : emitStr(v.v);
    case 'odt': case 'ldt': case 'ld': case 'lt': return trimFrac(v.v);
    case 'arr': {
      if (v.v.length === 0) return '[]';
      if (inline) return '[' + v.v.map((x) => emitValue(x, '', true)).join(', ') + ']';
      const inner = indent + '  ';
      const items = v.v.map((x) => inner + emitValue(x, inner) + ',');
      return '[\n' + items.join('\n') + '\n' + indent + ']';
    }
    case 'tbl': {
      // 内联发射(补全谱):表作为数组元素或嵌在内联表中时无节形可走,发内联形
      // 「{ k = v, .. }」(键码点排序,值递归);TOML 1.0 禁内联表含换行,inline 旗
      // 强制单行——数组收成 [1, 2]、串走基本串转义(\n 不落字面)。重解析仍得 tbl
      // 节点且混合数组 isSection 为 false → 再发射复走此臂,幂等成立。
      const keys = Object.keys(v.v).sort(cmpCodePoints);
      return '{' + keys.map((k) => `${emitKey(k)} = ${emitValue(v.v[k], '', true)}`).join(', ') + '}';
    }
    default: throw new Error('unreachable');
  }
}

const isSection = (val) => val.t === 'tbl' || (val.t === 'arr' && val.v.every((x) => x.t === 'tbl') && val.v.length > 0);

function emitTable(tbl, path, out) {
  const keys = Object.keys(tbl).sort(cmpCodePoints);
  const scalars = keys.filter((k) => !isSection(tbl[k]));
  const sections = keys.filter((k) => isSection(tbl[k]));
  for (const k of scalars) out.push(`${emitKey(k)} = ${emitValue(tbl[k], '')}`);
  for (const k of sections) {
    const v = tbl[k];
    const head = [...path, k].map(emitKey).join('.');
    if (v.t === 'tbl') {
      out.push('', `[${head}]`);
      emitTable(v.v, [...path, k], out);
    } else {
      for (const el of v.v) {
        out.push('', `[[${head}]]`);
        emitTable(el.v, [...path, k], out);
      }
    }
  }
}

export function normalizeToml(text) {
  const r = parseToml(text);
  if (!r.ok) return r;
  const out = [];
  emitTable(r.value.v, [], out);
  return { ok: true, text: out.join('\n') + '\n' };
}
