// src/tools/diff/shared/norm-yaml.js — YAML 规范形发射(ADR-0007):全块风格/缩进 2/
// 键码点排序/seq-of-map 紧凑形/引号收敛双引号/plain-safe 才裸写/多行串转义单行。
// 值等价⇒文本等价:发射形必能再解析回同型同值(「形态像数字/bool/null/含指示符或 ': '/' #'
// 等一律双引号」),幂等由此成立;拒绝直通 parseYaml 的 {ok:false, reason}。
import { parseYaml, scalarFromPlain } from './yaml-parse.js';
import { cmpCodePoints } from './codepoint.js';
import { emitInt, emitFloat } from './numbers.js';

// —— plain-safe 判定(收口点 C):非空、首字符非指示符、串中无集合指示符/控制符/引号、
// 无 ': ' 与行尾冒号(键值分隔)、无 ' #'(注释)、无首尾空白(再解析即剥),且推断同源
// (scalarFromPlain 判非 str 即引),数字形态宽化引(0x10/0o17/0b11/1_000/12:34/1.2.3 等
// ——1.2 核心读 str 而 1.1 系读数,裸写跨方言漂型;裁定钉测 0x10)。
const FIRST_INDICATOR = '-?:,[]{}#&*!|>\'"%@`';
const BODY_INDICATOR = ',[]{}\'"&*!|>%@`'; // 块串中本可容忍,保守一律引(计划:含指示符一律双引号)
const NUM_LEAD = /^[-+.\d]/;
const NUM_BODY = /^[0-9a-fA-FxXoObBpP._+:\-]+$/;

const looksNumeric = (s) => NUM_LEAD.test(s) && NUM_BODY.test(s) && /\d/.test(s);

function plainSafe(s) {
  if (s === '') return false; // 空 plain 即 null
  if (FIRST_INDICATOR.includes(s[0])) return false;
  // 文档标记族('...' / '... x'):裸写落 node-start 位(seq 项/键/根)再解析即撞标记守卫
  // (拒「文档标记同行内容」或根位静默漂 null),值位同门——终审 Critical
  if (s === '...' || /^\.\.\.[ \t]/.test(s)) return false;
  for (const ch of s) {
    if (BODY_INDICATOR.includes(ch)) return false;
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) return false; // 含换行/制表——多行串必转义单行
  }
  if (/^[ \t]|[ \t]$/.test(s)) return false;
  if (/(^|[ \t])#/.test(s)) return false;
  if (/:( |$|\t)/.test(s)) return false;
  if (scalarFromPlain(s).t !== 'str') return false; // 同源:bool/null/int/float/inf-nan 形态
  return !looksNumeric(s);
}

// 双引号转义:\\ \" \n \t \r,其余 <0x20 与 0x7f → \uXXXX(与 TOML escChar 同规则,本地实现)
const ESC = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t', '\r': '\\r' };
function dquote(s) {
  return '"' + [...s].map((c) => {
    if (ESC[c]) return ESC[c];
    const cp = c.codePointAt(0);
    return cp < 0x20 || cp === 0x7f ? '\\u' + cp.toString(16).padStart(4, '0') : c;
  }).join('') + '"';
}

function emitFloatYaml(n) {
  if (Number.isNaN(n)) return '.nan';
  if (n === Infinity) return '.inf';
  if (n === -Infinity) return '-.inf';
  return emitFloat(n);
}

function emitScalar(val) {
  switch (val.t) {
    case 'null': return 'null';
    case 'bool': return String(val.v);
    case 'int': return emitInt(val.v);
    case 'float': return emitFloatYaml(val.v); // 适配层:.inf/-.inf/.nan,其余同共享 emitFloat
    case 'str': return plainSafe(val.v) ? val.v : dquote(val.v);
    default: throw new Error('unreachable');
  }
}

// 键与串值同一道门:plain 键若是数字/bool/null 形态解析即拒,含分隔/注释/指示符亦然——引号豁免
const emitKey = (k) => (plainSafe(k) ? k : dquote(k));

// —— 块发射:容器值缩进 +2;seq 紧凑形——项容器首行贴 '- ',后续行落 dash 缩进 +2。
// firstPad 只替首行缩进,'- ' 恰 2 列,与续行自然对齐:seq-of-map/嵌套 seq 同一走线。
function emitMap(o, indent, out, firstPad) {
  let first = true;
  for (const k of Object.keys(o).sort(cmpCodePoints)) {
    const pad = first && firstPad !== undefined ? firstPad : ' '.repeat(indent);
    first = false;
    const v = o[k];
    if (v.t === 'map' && Object.keys(v.v).length > 0) {
      out.push(`${pad}${emitKey(k)}:`);
      emitMap(v.v, indent + 2, out);
    } else if (v.t === 'arr' && v.v.length > 0) {
      out.push(`${pad}${emitKey(k)}:`);
      emitSeq(v.v, indent + 2, out);
    } else if (v.t === 'map') out.push(`${pad}${emitKey(k)}: {}`);
    else if (v.t === 'arr') out.push(`${pad}${emitKey(k)}: []`);
    else out.push(`${pad}${emitKey(k)}: ${emitScalar(v)}`);
  }
}

function emitSeq(items, indent, out, firstPad) {
  let first = true;
  for (const x of items) {
    const pad = first && firstPad !== undefined ? firstPad : ' '.repeat(indent);
    first = false;
    if (x.t === 'map' && Object.keys(x.v).length > 0) emitMap(x.v, indent + 2, out, pad + '- ');
    else if (x.t === 'arr' && x.v.length > 0) emitSeq(x.v, indent + 2, out, pad + '- ');
    else if (x.t === 'map') out.push(`${pad}- {}`);
    else if (x.t === 'arr') out.push(`${pad}- []`);
    else out.push(`${pad}- ${emitScalar(x)}`);
  }
}

// 根形:map/arr 块形(空容器 flow 形 {} / []);null 文档 → 'null';根裸标量 → emitScalar
// (plain-safe 同守根位——str '123' 裸写会再解析成 int)
function emitBlock(val, out) {
  if (val.t === 'map') { if (Object.keys(val.v).length > 0) emitMap(val.v, 0, out); else out.push('{}'); }
  else if (val.t === 'arr') { if (val.v.length > 0) emitSeq(val.v, 0, out); else out.push('[]'); }
  else out.push(emitScalar(val));
}

export function normalizeYaml(text) {
  const r = parseYaml(text);
  if (!r.ok) return r;
  const out = [];
  emitBlock(r.value, out);
  return { ok: true, text: out.join('\n') + '\n' };
}
