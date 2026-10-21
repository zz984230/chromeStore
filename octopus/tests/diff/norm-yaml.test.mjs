// tests/diff/norm-yaml.test.mjs — YAML 规范形(wave-3 Task 3;ADR-0007 值等价⇒文本等价/幂等)
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYaml } from '../../src/tools/diff/shared/norm-yaml.js';

test('normalizeYaml flow 展开为块,三写法同值同文本', () => {
  const a = normalizeYaml('a: [1, 2]\n');
  const b = normalizeYaml('a:\n  - 1\n  - 2\n');
  assert.equal(a.text, b.text);
  assert.equal(a.text, 'a:\n  - 1\n  - 2\n');
});

test('normalizeYaml 引号风格收敛:plain-safe 裸写,否则双引号', () => {
  const a = normalizeYaml("a: 'plain safe'\nb: '1'\nc: \"true\"\nd: 'has: colon'\n");
  assert.equal(a.text, 'a: plain safe\nb: "1"\nc: "true"\nd: "has: colon"\n');
});

test('normalizeYaml 键码点排序;seq-of-map 紧凑形;空容器 flow 形', () => {
  const r = normalizeYaml('z: 1\na:\n  - k: 1\n    m: 2\n  - k: 3\nempty: {}\nlist: []\n');
  assert.equal(r.text, 'a:\n  - k: 1\n    m: 2\n  - k: 3\nempty: {}\nlist: []\nz: 1\n');
});

test('normalizeYaml 多行字符串发双引号转义单行;块标量输入同值同文本', () => {
  const a = normalizeYaml('s: |\n  a\n  b\n');
  const b = normalizeYaml('s: "a\\nb\\n"\n');
  assert.equal(a.text, b.text);
  assert.equal(a.text, 's: "a\\nb\\n"\n');
});

test('normalizeYaml 数字规范形:int 十进制、float 补 .0、-0 归 0、inf/nan 裸形', () => {
  const r = normalizeYaml('a: 0x10\nb: 1e2\nc: -0.0\nd: .inf\n');
  // 0x 是 int 十六进制?核心 schema int 只有十进制与 0o——0x 形态是字符串!以测试为准:0x10 为 str
  assert.equal(r.text, 'a: "0x10"\nb: 100.0\nc: 0.0\nd: .inf\n');
});

// 勘误(报告附探针):简报原输入 'm: {b: [1, {c: |-\n  x}], a: "s t"}\n' 把块标量写进 flow,
// 真 YAML 亦非法,parseYaml(终版)拒之(ok:false「flow 跨行」)——once.text 为 undefined,按原样不可实现。
// 最小修:块标量提为顶层键,保留全部辛辣面(flow 嵌套/无序键/带空格串/多行串)于一文。
test('normalizeYaml 幂等:对规范形再归一化不变', () => {
  const once = normalizeYaml('m: {b: [1, {c: x}], a: "s t"}\ns: |\n  a\n  b\n');
  const twice = normalizeYaml(once.text);
  assert.equal(twice.ok, true);
  assert.equal(twice.text, once.text);
});

test('normalizeYaml 拒绝直通:unsupported 带构造名,syntax 带行列', () => {
  const u = normalizeYaml('a: &x 1\n');
  assert.equal(u.ok, false);
  assert.equal(u.reason.kind, 'unsupported');
  const s = normalizeYaml('a: 1\n  b: 2\n');
  assert.equal(s.reason.kind, 'syntax');
  assert.equal(s.reason.line, 2);
});

// 根形(裁定 3)。勘误(报告附探针):裁定示例「'123\n' → '"123"\n'」会把 int 123 漂成
// str '123'(parseYaml('"123"\n') 为 str),且与映射内钉测(z: 1 / b: 100.0 裸形)自相矛盾——
// 值保真读法:int 根位裸形,plain-safe 之「守根位」落在 str 上(str '123' 裸写才会漂成 int)。
test('normalizeYaml 根形:空文档即 null,裸标量直发;plain-safe 守根位漂移', () => {
  assert.equal(normalizeYaml('').text, 'null\n');
  assert.equal(normalizeYaml('---\n').text, 'null\n'); // null 值同规范文本(值等价⇒文本等价)
  assert.equal(normalizeYaml('just a string\n').text, 'just a string\n');
  assert.equal(normalizeYaml('123\n').text, '123\n'); // int 根位裸形(emitInt)
  assert.equal(normalizeYaml('"123"\n').text, '"123"\n'); // str '123' 裸写会再解析成 int → 引
  assert.equal(normalizeYaml('- 1\n- 2\n').text, '- 1\n- 2\n'); // 根序列块形
  assert.equal(normalizeYaml('true\n').text, 'true\n'); // bool 根位裸形
  assert.equal(normalizeYaml('1.5\n').text, '1.5\n'); // float 根位裸形
  assert.equal(normalizeYaml('.inf\n').text, '.inf\n'); // inf 根位裸形
  const t = normalizeYaml('just a string\n');
  assert.equal(normalizeYaml(t.text).text, t.text); // 根位幂等
});

// 终审 Critical(探针在案):'...' 标记族曾裸写落 node-start 位,再归一化即撞标记守卫——
// '- "... x"' → '- ... x' 拒「文档标记同行内容」;根 '"..."' → '...' 静默漂 null(str→null
// 值变更,值等价⇒文本等价破坏)。plainSafe 拒之 → 全位引号形,幂等成立。
test('normalizeYaml ... 标记族全位引号形:seq 项/键/根,再归一化幂等', () => {
  const shapes = ['- "... x"', '- "..."', '"... x": 1', '"... x"', '"..."'];
  for (const src of shapes) {
    const once = normalizeYaml(src);
    assert.equal(once.ok, true);
    assert.ok(once.text.includes('"...'), once.text); // 规范形含引号(非裸标记)
    const twice = normalizeYaml(once.text);
    assert.equal(twice.ok, true, once.text);
    assert.equal(twice.text, once.text); // 幂等
  }
  assert.equal(normalizeYaml('- "... x"\n').text, '- "... x"\n'); // seq 项位
  assert.equal(normalizeYaml('- "..."\n').text, '- "..."\n'); // seq 项位(裸标记全文)
  assert.equal(normalizeYaml('"... x": 1\n').text, '"... x": 1\n'); // 键位
  assert.equal(normalizeYaml('"... x"\n').text, '"... x"\n'); // 根位
  assert.equal(normalizeYaml('"..."\n').text, '"..."\n'); // 根位:'...\n' 是错的(再解析漂 null)
});
