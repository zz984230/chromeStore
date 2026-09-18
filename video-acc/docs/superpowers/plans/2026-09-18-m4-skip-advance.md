# M4 跳过 + 自动续播 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 片头/片尾跳过与自动续播——开始播放自动越过片头、临近片尾按规则收尾（循环暂停/普通跳到结尾）、视频自然结束后若站点未连播则打分找「下一节」入口并触发；兑现验收 #5、#6。

**Architecture:** 决策逻辑全部纯函数化（`skipPlan.js` 片头/片尾/快捷调参、`advance.js` 打分与指针序列）；keeper 经 `hooks`（onPlay/onTimeUpdate/onEnded）把三个视频事件交给 content 的策略层，机制与策略分离；设置仍走 storage 总线（快照 + 订阅回声），手动续播经新协议字面量 `advance.run` 由 popup/后台直推活动页。与参考插件的分桶启发式不同，续播候选用**单趟打分**（强词/弱词/负词一票否决 + 可见性过滤）。

**Tech Stack:** 现有底座，无新依赖。manifest 增补仅 3 条**无默认键**命令（intro-minus / intro-plus / advance-now——grilling 已批的 7 命令清单内，Chrome 预置键位已满 4 个故不设 suggested_key）。

## Global Constraints

- 命名体系以 `CONTEXT.md` 为准：片头跳过（intro skip）/片尾跳过（outro skip）/自动续播（auto-advance）。禁参考插件标识符：`skipStart/skipEnd/skipEnabled/autoNextEnabled/findNextButton/triggerNextVideo/NEXT_PATTERNS/NEXT_EXCLUDE`。
- storage 键 `vpa.settings`，M4 schema：`{ pace:1, hold:false, heldPace:1, introSkip:0, outroSkip:0, skipOn:false, autoAdvance:false }`（缺字段回填）。
- **行为规格（参考语义复刻，grilling 已批）**：片头=开始播放时位置仍在其内则 seek 过去（启用瞬间对播放中的视频立即生效）；片尾=剩余 < outroSkip 时循环视频 `pause()`、普通视频 `currentTime = duration` 触发自然 ended；快捷键片头 ±5 秒且调到 >0 自动启用；自动续播=ended 后延迟 300ms，视频仍暂停（站点未连播）才触发；手动续播不受总开关限制。
- manifest 增补仅限上述 3 条命令（无 suggested_key）；其余任何 manifest 变更须用户同意。
- UI/注释全中文；conventional commits + `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- **防抄袭门禁报告必须引用实读的参考文件路径**（`fjhe.../2.1.0_0/` 在盘；M3 终审发现某任务门禁只对照了计划文档——禁止重演）。
- 回归基线：49/49 单测；M3 收尾状态（含 popup verEl 防护、store lastError 拒斥、nudge 回包契约）。

## 文件地图

```
src/shared/skipPlan.js      片头/片尾/快捷调参纯函数
src/shared/store.js         DEFAULT_SETTINGS + 4 个 M4 字段
src/shared/protocol.js      += RUN_ADVANCE
src/shared/notify.js        += pushAdvanceNow
src/content/advance.js      续播打分（纯）+ 候选收集/触发（胶水）
src/content/keeper.js       hooks 接缝（onPlay/onTimeUpdate/onEnded）
src/content/main.js         快照扩展 + hooks 策略 + advance.run 消息
src/background/main.js      intro-minus/intro-plus/advance-now
src/popup/main.js + public/popup.html/.css  跳过/续播区块（.switch 词汇统一）
public/manifest.json        commands += 3
tests/unit/skip-plan.test.mjs  advance.test.mjs  keeper.test.mjs（追加）
tests/unit/content-main.test.mjs（追加）  background.test.mjs（追加）
docs/verification/m4.md     验收证据 + 并排相似度自查结论
```

---

### Task 1: skipPlan 纯决策 + store M4 字段

**Files:**
- Create: `src/shared/skipPlan.js`
- Modify: `src/shared/store.js`
- Test: `tests/unit/skip-plan.test.mjs`
- Test: `tests/unit/store.test.mjs`（追加 schema 升级断言）

**Interfaces:**
- Consumes: 现有 store 模式
- Produces:
  - `SKIP_CEILING=3600`、`INTRO_TUNING=5`；`clampSkip(seconds)→number`（0–3600，一位小数，非有限→0）
  - `introSeekTarget({position, introSkip})→number|null`（introSkip>0 且 0≤position<introSkip → introSkip；否则 null）
  - `outroAction({remaining, loop, outroSkip})→'pause'|'toEnd'|null`（outroSkip>0 且 0≤remaining<outroSkip → loop?'pause':'toEnd'）
  - `retuneIntro(current, delta)→{introSkip, skipOn}`（±delta 后钳制；introSkip>0 自动 skipOn=true）
  - store `DEFAULT_SETTINGS` 增四字段（见全局约束）

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/skip-plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKIP_CEILING, INTRO_TUNING,
  clampSkip, introSeekTarget, outroAction, retuneIntro,
} from '../../src/shared/skipPlan.js';

test('常量与钳制', () => {
  assert.equal(SKIP_CEILING, 3600);
  assert.equal(INTRO_TUNING, 5);
  assert.equal(clampSkip(0), 0);
  assert.equal(clampSkip(-3), 0);
  assert.equal(clampSkip(9999), 3600);
  assert.equal(clampSkip(12.34), 12.3);
  assert.equal(clampSkip('x'), 0);
  assert.equal(clampSkip(NaN), 0);
});

test('片头：位置落在片头区间内才给跳点', () => {
  assert.equal(introSeekTarget({ position: 2, introSkip: 10 }), 10);
  assert.equal(introSeekTarget({ position: 10, introSkip: 10 }), null, '已过片头不跳');
  assert.equal(introSeekTarget({ position: 0, introSkip: 0 }), null, '未启用');
  assert.equal(introSeekTarget({ position: -1, introSkip: 10 }), null, '异常位置不跳');
});

test('片尾：进入区间后循环暂停、普通跳结尾', () => {
  assert.equal(outroAction({ remaining: 3, loop: true, outroSkip: 5 }), 'pause');
  assert.equal(outroAction({ remaining: 3, loop: false, outroSkip: 5 }), 'toEnd');
  assert.equal(outroAction({ remaining: 8, outroSkip: 5 }), null, '未进区间');
  assert.equal(outroAction({ remaining: 3, outroSkip: 0 }), null, '未启用');
});

test('快捷调参：±5 且调到正值自动启用', () => {
  assert.deepEqual(retuneIntro(0, 5), { introSkip: 5, skipOn: true });
  assert.deepEqual(retuneIntro(12, -5), { introSkip: 7, skipOn: true });
  assert.deepEqual(retuneIntro(3, -5), { introSkip: 0, skipOn: false }, '减到 0 即关');
  assert.deepEqual(retuneIntro(3599, 5), { introSkip: 3600, skipOn: true }, '上限钳制');
});
```

`tests/unit/store.test.mjs` 追加（连带更新：既有「loadSettings 空库返回默认，缺字段回填」测试的期望字面量随 schema 增长——`{ pace: 1, hold: false, heldPace: 1, introSkip: 0, outroSkip: 0, skipOn: false, autoAdvance: false }`，与 M3 c75ba42 同款模式）：

```js
test('schema 升级：M3 存储缺 M4 跳过字段回填默认', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { pace: 2, hold: true, heldPace: 2 } });
  const s = await loadSettings(mem);
  assert.equal(s.introSkip, 0);
  assert.equal(s.outroSkip, 0);
  assert.equal(s.skipOn, false);
  assert.equal(s.autoAdvance, false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/skip-plan.test.mjs tests/unit/store.test.mjs`
Expected: skip-plan FAIL（模块不存在）；store 新测试 FAIL（字段 undefined）

- [ ] **Step 3: 写实现**

```js
// src/shared/skipPlan.js — 片头/片尾跳过的纯决策函数（行为规格见 M4 计划全局约束）
export const SKIP_CEILING = 3600; // 跳过秒数上限（防误填）
export const INTRO_TUNING = 5;    // 快捷键片头调整步长

export function clampSkip(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return 0;
  return Math.min(SKIP_CEILING, Math.max(0, Math.round(n * 10) / 10));
}

// 片头：开始播放时若位置仍落在片头区间内，返回应跳到的目标秒数；否则 null
export function introSeekTarget({ position, introSkip }) {
  if (!(introSkip > 0) || !(position >= 0)) return null;
  return position < introSkip ? introSkip : null;
}

// 片尾：剩余时间进入片尾区间时的处置——循环视频暂停原地，普通视频跳到结尾触发自然结束
export function outroAction({ remaining, loop, outroSkip }) {
  if (!(outroSkip > 0) || !(remaining >= 0)) return null;
  if (remaining < outroSkip) return loop ? 'pause' : 'toEnd';
  return null;
}

// 快捷键片头 ±N 秒：调到 >0 自动启用跳过
export function retuneIntro(current, delta) {
  const introSkip = clampSkip((Number(current) || 0) + delta);
  return { introSkip, skipOn: introSkip > 0 };
}
```

`src/shared/store.js` 的 `DEFAULT_SETTINGS` 替换为：

```js
export const DEFAULT_SETTINGS = Object.freeze({
  pace: 1,        // 当前档位
  hold: false,    // 保持模式（M3）
  heldPace: 1,    // 记忆档位（M3）
  introSkip: 0,   // 片头跳过秒数（M4）
  outroSkip: 0,   // 片尾跳过秒数（M4）
  skipOn: false,  // 跳过总开关（M4）
  autoAdvance: false, // 自动续播开关（M4）
});
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `node --test tests/unit/skip-plan.test.mjs tests/unit/store.test.mjs && npm test`
Expected: skip-plan 4/4；store 11/11；全量 56/56（51 + 5，基线含 M3 fix wave 的 2 项负向测试）

- [ ] **Step 5: Commit**

```bash
git add src/shared/skipPlan.js src/shared/store.js tests/unit/skip-plan.test.mjs tests/unit/store.test.mjs
git commit -m "feat(m4): skip decision helpers and schema fields

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: advance 打分启发式 + 指针序列

**Files:**
- Create: `src/content/advance.js`
- Test: `tests/unit/advance.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `advanceScore({label, text, cls, disabled})→number`（负词/禁用 → -Infinity；强词 label+6/text+3、弱词 label+2/text+1、cls 含 next +0.5；强词=「下一(节|集|课|章|话|回|P|篇)」或 next ep/episode/lesson/chapter/part，弱词=「下一个|下集|next」，负词=「上一|prev|previous|下一页|next page|下一个标签|评论|comment|相关|related|推荐|recommend|playlist|播放列表|tab」）
  - `pickAdvanceIndex(descriptors)→number`（>0 分的最高分下标，同分取先；无候选 -1）
  - `pokeTarget(el)→boolean`（pointerdown/mousedown/pointerup/mouseup + click 兜底，PointerEvent 失败退 MouseEvent）
  - `collectAdvanceCandidates(doc)→[{el,label,text,cls,disabled}]`（DOM 胶水，不单测）
  - `runAdvance(doc)→boolean`（收集→可见性过滤→打分→触发；DOM 胶水，不单测）

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/advance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceScore, pickAdvanceIndex } from '../../src/content/advance.js';

test('强词打分高于弱词，label 加倍', () => {
  const strong = advanceScore({ label: '下一节', text: '', cls: '' });
  const strongText = advanceScore({ label: '', text: '下一章', cls: '' });
  const weak = advanceScore({ label: 'next', text: '', cls: '' });
  const clsOnly = advanceScore({ label: '', text: '', cls: 'btn-next-arrow' });
  assert.ok(strong > weak && weak > clsOnly && clsOnly > 0, `强>${weak}>${clsOnly}>0`);
  assert.ok(strongText > 0 && strong > strongText, 'label 命中权重高于正文');
});

test('负词与禁用一票否决', () => {
  assert.equal(advanceScore({ label: '下一节', text: '', cls: '' , disabled: true }), -Infinity);
  assert.equal(advanceScore({ label: '', text: '下一个标签页', cls: '' }), -Infinity);
  assert.equal(advanceScore({ label: '上一节', text: '', cls: '' }), -Infinity);
  assert.equal(advanceScore({ label: '', text: '下一页', cls: '' }), -Infinity);
  assert.equal(advanceScore({ label: '', text: '相关推荐', cls: '' }), -Infinity);
});

test('pickAdvanceIndex 取最高分、无候选返回 -1', () => {
  const ds = [
    { label: '', text: '目录', cls: '' },
    { label: '下一节', text: '', cls: '' },
    { label: '', text: 'next', cls: '' },
  ];
  assert.equal(pickAdvanceIndex(ds), 1);
  assert.equal(pickAdvanceIndex([{ label: '', text: '上一节', cls: '' }]), -1);
  assert.equal(pickAdvanceIndex([]), -1);
});

test('英文强词与中文变体', () => {
  assert.ok(advanceScore({ label: 'Next Episode', text: '', cls: '' }) > 3);
  assert.ok(advanceScore({ label: '', text: '下一课', cls: '' }) > 0);
  assert.ok(advanceScore({ label: '', text: '下一P', cls: '' }) > 0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/advance.test.mjs`
Expected: FAIL —— `Cannot find module .../advance.js`

- [ ] **Step 3: 写实现**

```js
// src/content/advance.js — 自动续播：候选打分（纯）+ 收集与触发（胶水）
// 与参考插件的分桶法不同：单趟打分、负词一票否决、按可见性收尾。

// 强词：明确的下一节/集/课/章/话/回/P/篇 或 next episode 系
const STRONG = /下一(节|集|课|章|话|回|P|p|篇)|next\s*(ep|episode|lesson|chapter|part)/i;
// 弱词：泛指的下一个/next
const WEAK = /下一个|下集|next\b/i;
// 负词：上一系、翻页、标签页、评论/相关/推荐、播放列表——一票否决防误点
const NEGATIVE = /上一|prev|previous|下一页|next\s*page|下一个标签|评论|comment|相关|related|推荐|recommend|playlist|播放列表|\btab\b/i;

export function advanceScore({ label = '', text = '', cls = '', disabled = false }) {
  if (disabled) return -Infinity;
  const hay = `${label} ${text} ${cls}`;
  if (NEGATIVE.test(hay)) return -Infinity;
  let score = 0;
  if (STRONG.test(label)) score += 6;      // title/aria 比正文可信
  else if (WEAK.test(label)) score += 2;
  if (STRONG.test(text)) score += 3;
  else if (WEAK.test(text)) score += 1;
  if (/next/i.test(cls)) score += 0.5;
  return score;
}

export function pickAdvanceIndex(descriptors) {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < descriptors.length; i++) {
    const s = advanceScore(descriptors[i]);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

// 触发一次完整指针序列（兼容原生 click 与 React/Vue 合成事件）
export function pokeTarget(el) {
  try {
    const opts = { bubbles: true, cancelable: true, view: globalThis };
    const fire = (type) => {
      try { el.dispatchEvent(new PointerEvent(type, opts)); }
      catch { el.dispatchEvent(new MouseEvent(type, opts)); }
    };
    fire('pointerdown');
    fire('mousedown');
    fire('pointerup');
    fire('mouseup');
    el.click?.();
    return true;
  } catch { return false; }
}

// —— 以下为 DOM 胶水（不单测，Task 8 /tabbit 实测覆盖）——

export function collectAdvanceCandidates(doc) {
  const nodes = doc.querySelectorAll(
    'button, a, [role="button"], [onclick], [class*="next" i], [class*="cursor-pointer" i]'
  );
  const out = [];
  for (const el of nodes) {
    out.push({
      el,
      label: (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim().slice(0, 60),
      text: (el.textContent || '').trim().slice(0, 80),
      cls: typeof el.className === 'string' ? el.className : '',
      disabled: !!el.disabled,
    });
  }
  return out;
}

export function runAdvance(doc) {
  const visible = collectAdvanceCandidates(doc).filter((c) => {
    const rect = c.el.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0;
  });
  const idx = pickAdvanceIndex(visible);
  if (idx < 0) return false;
  return pokeTarget(visible[idx].el);
}
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `node --test tests/unit/advance.test.mjs && npm test`
Expected: advance 4/4；全量 60/60（56 + 4）

- [ ] **Step 5: 人工对照参考源（防抄袭门禁）**

对照 `fjhe.../2.1.0_0/content.js` 的 `NEXT_PATTERNS/NEXT_EXCLUDE/findNextButton/triggerNextVideo`（四桶数组 + 正则列表 + 事件序列）：本实现为单趟打分函数（数值权重 + -Infinity 否决）、自编正则集合（词表不可避免重叠但组合与结构不同）、`pokeTarget` 与其 `fire()` 序列同为指针事件惯例。在报告中记录比对结论。

- [ ] **Step 6: Commit**

```bash
git add src/content/advance.js tests/unit/advance.test.mjs
git commit -m "feat(m4): single-pass advance scoring and pointer poke sequence

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: keeper hooks 接缝

**Files:**
- Modify: `src/content/keeper.js`
- Test: `tests/unit/keeper.test.mjs`（追加）

**Interfaces:**
- Consumes: M3 keeper（`createKeeper({trip, chip})`）
- Produces: `createKeeper({trip, chip, hooks = {}})`；`hooks.onPlay(video)`/`hooks.onTimeUpdate(video)`/`hooks.onEnded(video)` 存在时 attach 各挂一个对应监听（与既有施档监听并存互不干扰）

- [ ] **Step 1: 写失败测试**

`tests/unit/keeper.test.mjs` 追加：

```js
test('hooks：play/timeupdate/ended 各回调一次并携带视频', async () => {
  const seen = { play: 0, timeupdate: 0, ended: 0 };
  const keeper = createKeeper({
    trip: deps_free().trip, chip: deps_free().chip,
    hooks: {
      onPlay: (v) => { seen.play += 1; assert.ok(v instanceof FakeVideo); },
      onTimeUpdate: () => { seen.timeupdate += 1; },
      onEnded: () => { seen.ended += 1; },
    },
  });
  const v = new FakeVideo();
  keeper.attach(v);
  v.fire('play');
  v.fire('timeupdate');
  v.fire('timeupdate');
  v.fire('ended');
  assert.deepEqual(seen, { play: 1, timeupdate: 2, ended: 1 });
});

test('hooks 缺省时行为与 M3 完全一致', () => {
  const d = deps_free();
  const keeper = createKeeper({ trip: d.trip, chip: d.chip }); // 不传 hooks
  const v = new FakeVideo();
  keeper.attach(v);
  v.fire('play');      // 施档纠回路径不受影响
  v.fire('ended');     // 无 onEnded 也不报错
  assert.equal(keeper.isKept(v), true);
});
```

其中 `deps_free` 为文件内新加的极简依赖工厂（放在既有 `makeDeps` 旁）：

```js
function deps_free() {
  return { trip: { allows: () => true, reset: () => {} }, chip: { flash: () => {} } };
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/keeper.test.mjs`
Expected: FAIL —— hooks 回调未触发（attach 未挂 hooks 监听）

- [ ] **Step 3: 写实现**

`src/content/keeper.js` 两处修改。签名行：

```js
export function createKeeper({ trip, chip, hooks = {} } = {}) {
```

`attach` 内三个既有监听之后追加：

```js
    if (hooks.onPlay) video.addEventListener('play', () => hooks.onPlay(video));
    if (hooks.onTimeUpdate) video.addEventListener('timeupdate', () => hooks.onTimeUpdate(video));
    if (hooks.onEnded) video.addEventListener('ended', () => hooks.onEnded(video));
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `node --test tests/unit/keeper.test.mjs && npm test`
Expected: keeper 12/12；全量 62/62（60 + 2）

- [ ] **Step 5: Commit**

```bash
git add src/content/keeper.js tests/unit/keeper.test.mjs
git commit -m "feat(m4): keeper hooks for play/timeupdate/ended policy wiring

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: content 策略接线（跳过 + 续播 + advance.run）

**Files:**
- Modify: `src/shared/protocol.js`
- Modify: `src/content/main.js`
- Test: `tests/unit/content-main.test.mjs`（追加）

**Interfaces:**
- Consumes: Task 1 `introSeekTarget/outroAction/clampSkip`；Task 2 `runAdvance`；Task 3 `hooks`
- Produces: `protocol.js` 增 `RUN_ADVANCE='advance.run'`（载荷 `{vpa}` → `{ok:boolean}`，不受 autoAdvance 总开关限制）。content 行为：
  - 快照扩展 `introSkip/outroSkip/skipOn/autoAdvance`（boot + echo 同步更新；跳过启用瞬间对播放中且仍在片头区间的视频立即 seek——行为规格）
  - `hooks.onPlay`：skipOn 且 introSeekTarget 命中 → `currentTime = target`
  - `hooks.onTimeUpdate`：skipOn 且 outroAction 命中 → `'pause'` 则 `video.pause()`、`'toEnd'` 则 `currentTime = duration`（duration 非有限正数则跳过）
  - `hooks.onEnded`：autoAdvance 时 `setTimeout(...,300)` 后视频仍 `paused` 才 `runAdvance(doc)`
  - 消息 `advance.run` → `respond({ ok: runAdvance(doc) })`

- [ ] **Step 1: 写失败测试**

`tests/unit/content-main.test.mjs` 追加（沿用文件内既有 fake 设施与 `MemoryStorage`/`SETTINGS`；`FakeVideo` 需补 `loop`、`duration`、`currentTime`、`paused` 字段——在类定义处加 `constructor` 初始化 `this.loop=false; this.duration=NaN; this.currentTime=0; this.paused=true;`）：

```js
import { RUN_ADVANCE } from '../../src/shared/protocol.js';

test('跳过：播放时越过片头', async () => {
  const v = new FakeVideo();
  const runtime = fakeRuntime();
  const mem = new MemoryStorage({ [SETTINGS]: { skipOn: true, introSkip: 10, outroSkip: 0 } });
  wireContent({ runtime, storage: mem, doc: fakeDoc([v]), MutationObserver: FakeObserver, setInterval: () => 0, makeChip: () => ({ flash: () => {} }) });
  await new Promise((r) => setTimeout(r, 0));
  v.currentTime = 2;
  v.fire('play');
  assert.equal(v.currentTime, 10, '片头跳过');
});

test('跳过：临近片尾——循环暂停、普通跳结尾', async () => {
  const looped = new FakeVideo(); const linear = new FakeVideo();
  looped.loop = true;
  const mem = new MemoryStorage({ [SETTINGS]: { skipOn: true, introSkip: 0, outroSkip: 5 } });
  const doc = { documentElement: {}, querySelectorAll: (sel) => (sel === 'video' ? [looped, linear] : []) };
  wireContent({ runtime: fakeRuntime(), storage: mem, doc, MutationObserver: FakeObserver, setInterval: () => 0, makeChip: () => ({ flash: () => {} }) });
  await new Promise((r) => setTimeout(r, 0));
  for (const v of [looped, linear]) { v.duration = 100; v.currentTime = 97; }
  const paused = [];
  looped.pause = () => paused.push('loop');
  linear.__defineSetter__('currentTime', function (t) { this.__t = t; });
  linear.__defineGetter__('currentTime', function () { return this.__t ?? 97; });
  looped.fire('timeupdate');
  linear.fire('timeupdate');
  assert.deepEqual(paused, ['loop'], '循环视频暂停');
  assert.equal(linear.currentTime, 100, '普通视频跳到结尾');
});

test('跳过关闭时不干预', async () => {
  const v = new FakeVideo();
  const mem = new MemoryStorage({ [SETTINGS]: { skipOn: false, introSkip: 10 } });
  wireContent({ runtime: fakeRuntime(), storage: mem, doc: fakeDoc([v]), MutationObserver: FakeObserver, setInterval: () => 0, makeChip: () => ({ flash: () => {} }) });
  await new Promise((r) => setTimeout(r, 0));
  v.currentTime = 2;
  v.fire('play');
  assert.equal(v.currentTime, 2);
});

test('advance.run 直接触发续播（不受总开关限制）', async () => {
  const runtime = fakeRuntime();
  let advanced = 0;
  const doc = { documentElement: {}, querySelectorAll: (sel) => (sel === 'video' ? [] : []) };
  // 用可注入的 runAdvance 替身：经 wireContent 的 makeAdvance 缝注入
  wireContent({ runtime, doc, MutationObserver: FakeObserver, setInterval: () => 0, makeChip: () => ({ flash: () => {} }), makeAdvance: () => () => { advanced += 1; return true; } });
  let reply = null;
  runtime.listeners[0]({ vpa: RUN_ADVANCE }, {}, (r) => { reply = r; });
  assert.equal(advanced, 1);
  assert.deepEqual(reply, { ok: true });
});

test('自动续播：ended 后 300ms 仍暂停才触发', async () => {
  const v = new FakeVideo(); // paused 默认 true（站点未连播）
  let advanced = 0;
  const mem = new MemoryStorage({ [SETTINGS]: { autoAdvance: true } });
  wireContent({ runtime: fakeRuntime(), storage: mem, doc: fakeDoc([v]), MutationObserver: FakeObserver, setInterval: () => 0, makeChip: () => ({ flash: () => {} }), makeAdvance: () => () => { advanced += 1; return true; } });
  await new Promise((r) => setTimeout(r, 0));
  v.fire('ended');
  assert.equal(advanced, 0, '300ms 延迟内未触发');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(advanced, 1, '延迟后触发');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/content-main.test.mjs`
Expected: FAIL —— `RUN_ADVANCE` 导出不存在、hooks 未接线、`makeAdvance` 参数不存在

- [ ] **Step 3: 写实现**

`src/shared/protocol.js` 追加一行：

```js
export const RUN_ADVANCE = 'advance.run'; // { vpa: RUN_ADVANCE } → { ok: boolean }
```

`src/content/main.js` 全量替换为：

```js
// src/content/main.js — 内容脚本组装：发现 + 接线 + 浮标 + 窄消息 + 保持 + 跳过/续播
import { createTripWatch } from './guard.js';
import { createKeeper } from './keeper.js';
import { createChip } from './chip.js';
import { startDiscovery } from './discovery.js';
import { runAdvance as defaultRunAdvance } from './advance.js';
import { clampPace, formatPace } from '../shared/paceMath.js';
import { introSeekTarget, outroAction } from '../shared/skipPlan.js';
import { loadSettings, subscribeSettings } from '../shared/store.js';
import { APPLY_PACE, PROBE_PACE, RUN_ADVANCE } from '../shared/protocol.js';

export function wireContent({
  runtime = chrome.runtime,
  storage,
  doc = document,
  MutationObserver: MO = globalThis.MutationObserver,
  setInterval: tick = globalThis.setInterval,
  setTimeout: later = globalThis.setTimeout,
  makeChip = createChip,
  makeAdvance = () => defaultRunAdvance,
  log = console.info,
} = {}) {
  const chip = makeChip(doc);
  const runAdvance = makeAdvance(doc);
  const trip = createTripWatch({
    onTrip: () => log('[视频倍速助手] 站点持续改档，守速已熔断；下次调档自动恢复'),
  });
  const keeper = createKeeper({ trip, chip, hooks: {
    onPlay: (video) => {
      if (!skip.on) return;
      const target = introSeekTarget({ position: video.currentTime, introSkip: skip.introSkip });
      if (target != null) { try { video.currentTime = target; } catch { /* 受限元素忽略 */ } }
    },
    onTimeUpdate: (video) => {
      if (!skip.on) return;
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const act = outroAction({ remaining: d - video.currentTime, loop: !!video.loop, outroSkip: skip.outroSkip });
      if (act === 'pause') { try { video.pause(); } catch { /* 同上 */ } }
      else if (act === 'toEnd') { try { video.currentTime = d; } catch { /* 同上 */ } }
    },
    onEnded: (video) => {
      if (!advance.auto) return;
      // 300ms 延迟：站点自身连播（视频重新起播）则不干预
      later(() => { if (video.paused) runAdvance(doc); }, 300);
    },
  } });
  const videos = () => doc.querySelectorAll('video');

  // 本帧快照：保持（M3）+ 跳过/续播（M4），经 storage 总线同步
  let hold = false;
  let heldPace = 1;
  const skip = { on: false, introSkip: 0, outroSkip: 0 };
  const advance = { auto: false };
  const holdText = (pace) => `🔒 ${formatPace(pace)}`;

  const takeSnapshot = (s) => {
    hold = !!s.hold;
    heldPace = clampPace(s.heldPace);
    skip.on = !!s.skipOn;
    skip.introSkip = clampSkip(s.introSkip);
    skip.outroSkip = clampSkip(s.outroSkip);
    advance.auto = !!s.autoAdvance;
  };
  // 跳过启用瞬间：对播放中且仍在片头区间的视频立即生效（行为规格）
  const introSweep = () => {
    if (!skip.on || !(skip.introSkip > 0)) return;
    for (const v of videos()) {
      if (v.paused) continue;
      const target = introSeekTarget({ position: v.currentTime, introSkip: skip.introSkip });
      if (target != null) { try { v.currentTime = target; } catch { /* 同上 */ } }
    }
  };

  startDiscovery({
    doc,
    onFound: (v) => {
      keeper.attach(v);
      if (hold) keeper.applyAll([v], heldPace, { resetTrip: true, flashText: holdText(heldPace) });
    },
    isKept: (v) => keeper.isKept(v),
    MutationObserver: MO,
    setInterval: tick,
  });

  runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.vpa === APPLY_PACE) {
      keeper.applyAll(videos(), msg.pace, { resetTrip: true, flashText: formatPace(msg.pace) });
      respond?.({ ok: true, pace: keeper.lastPace() });
      return;
    }
    if (msg?.vpa === PROBE_PACE) {
      respond?.({ pace: keeper.lastPace() });
      return;
    }
    if (msg?.vpa === RUN_ADVANCE) {
      respond?.({ ok: runAdvance(doc) }); // 手动续播不受总开关限制
    }
  });

  if (storage) {
    loadSettings(storage).then((s) => {
      takeSnapshot(s);
      if (hold) keeper.applyAll(videos(), heldPace, { resetTrip: true, flashText: holdText(heldPace) });
      introSweep();
    });
    subscribeSettings((s) => {
      const skipWasOn = skip.on;
      takeSnapshot(s);
      if (hold) keeper.applyAll(videos(), heldPace, {}); // 静默回声套用
      if (!skipWasOn && skip.on) introSweep();            // 启用瞬间生效
    }, storage);
  }

  log('[视频倍速助手] 已注入帧:', globalThis.location?.href);
  return { keeper };
}

// 守卫式自启：node 测试环境无扩展 id 不启动；真实内容脚本有 id 才组装
if (globalThis.chrome?.runtime?.id) wireContent({ storage: globalThis.chrome?.storage?.local });
```

（import 区需补 `clampSkip`：`import { introSeekTarget, outroAction, clampSkip } from '../shared/skipPlan.js';`）

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `node --test tests/unit/content-main.test.mjs && npm test`
Expected: content-main 11/11（原 6 + 新 5）；全量 67/67（62 + 5）

- [ ] **Step 5: 人工对照参考源（防抄袭门禁）**

对照 `fjhe.../content.js` 的 skip/autonext 路径（`state.skipStart/skipEnd/skipEnabled/autoNextEnabled`、play 内嵌片头 seek、timeupdate 内嵌片尾分支、ended+300ms+`triggerNextVideo`、`skipChanged` 即时 seek）：本实现决策函数全部抽到 `skipPlan.js`、事件经 keeper hooks 分发、快照对象分域（skip/advance）而非平铺 state、`makeAdvance` 注入缝。在报告中记录比对结论。

- [ ] **Step 6: Commit**

```bash
git add src/shared/protocol.js src/content/main.js tests/unit/content-main.test.mjs
git commit -m "feat(m4): skip and auto-advance policy wiring with advance.run message

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: background 三命令 + manifest + pushAdvanceNow

**Files:**
- Modify: `src/shared/notify.js`
- Modify: `src/background/main.js`
- Modify: `public/manifest.json`
- Test: `tests/unit/notify.test.mjs`（追加）
- Test: `tests/unit/background.test.mjs`（追加）

**Interfaces:**
- Consumes: Task 1 `retuneIntro/INTRO_TUNING`；Task 4 `RUN_ADVANCE`；现有 `nudgeActiveTab` 模式
- Produces: `pushAdvanceNow(tabsApi?)→Promise<boolean>`（推 `{vpa:RUN_ADVANCE}` 到活动页；不可达 false 不抛）；background 处理 `intro-minus`/`intro-plus`（`retuneIntro` 后写存储，走总线同步快照，不直推）与 `advance-now`（`pushAdvanceNow`）；manifest commands 增三条（无 suggested_key）

- [ ] **Step 1: 写失败测试**

`tests/unit/notify.test.mjs` 追加：

```js
import { pushAdvanceNow } from '../../src/shared/notify.js';
import { RUN_ADVANCE } from '../../src/shared/protocol.js';

test('pushAdvanceNow 推送 advance.run 到活动页', async () => {
  const { api, sent } = tabsFake({ tabId: 7 });
  assert.equal(await pushAdvanceNow(api), true);
  assert.deepEqual(sent, [{ id: 7, msg: { vpa: RUN_ADVANCE } }]);
});

test('pushAdvanceNow 失败返回 false 不抛', async () => {
  const { api } = tabsFake({ fail: true });
  assert.equal(await pushAdvanceNow(api), false);
});
```

`tests/unit/background.test.mjs` 追加：

```js
test('intro-plus 调到 5 秒并自动启用跳过', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { introSkip: 0, skipOn: false } });
  const commands = fakeCommands();
  wireBackground({ commands, storage: mem, tabsApi: { query: async () => [{ id: 1 }], sendMessage: async () => {} }, version: '0.1.0', log: () => {} });
  await commands.handlers[0]('intro-plus');
  assert.equal(mem.data[STORAGE_KEY].introSkip, 5);
  assert.equal(mem.data[STORAGE_KEY].skipOn, true);
});

test('intro-minus 减到 0 自动关闭', async () => {
  const mem = new MemoryStorage({ [STORAGE_KEY]: { introSkip: 3, skipOn: true } });
  const commands = fakeCommands();
  wireBackground({ commands, storage: mem, tabsApi: { query: async () => [{}] }, version: '0.1.0', log: () => {} });
  await commands.handlers[0]('intro-minus');
  assert.equal(mem.data[STORAGE_KEY].introSkip, 0);
  assert.equal(mem.data[STORAGE_KEY].skipOn, false);
});

test('advance-now 推送活动页', async () => {
  const mem = new MemoryStorage();
  const commands = fakeCommands();
  const sent = [];
  wireBackground({ commands, storage: mem, tabsApi: { query: async () => [{ id: 4 }], sendMessage: async (id, m) => sent.push({ id, m }) }, version: '0.1.0', log: () => {} });
  await commands.handlers[0]('advance-now');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].m.vpa, 'advance.run');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/notify.test.mjs tests/unit/background.test.mjs`
Expected: notify 新 2 项 FAIL（无 pushAdvanceNow）；background 新 3 项 FAIL（命令未处理）

- [ ] **Step 3: 写实现**

`src/shared/notify.js` 追加：

```js
import { APPLY_PACE, RUN_ADVANCE } from './protocol.js'; // import 行改为具名两个

// 手动续播：推 advance.run 到活动标签页（不受 autoAdvance 总开关限制）
export async function pushAdvanceNow(tabsApi = globalThis.chrome?.tabs) {
  if (!tabsApi) return false;
  try {
    const [tab] = await tabsApi.query({ active: true, currentWindow: true });
    if (!tab?.id) return false;
    await tabsApi.sendMessage(tab.id, { vpa: RUN_ADVANCE });
    return true;
  } catch {
    return false; // 受限页 / 内容脚本未注入
  }
}
```

`src/background/main.js`：import 区补 `retuneIntro, INTRO_TUNING`（自 `../shared/skipPlan.js`）与 `pushAdvanceNow`（自 `../shared/notify.js`）；监听器在 hold-toggle 分支后追加：

```js
    if (id === 'intro-minus' || id === 'intro-plus') {
      const s = await loadSettings(storage);
      const tuned = retuneIntro(s.introSkip, id === 'intro-plus' ? INTRO_TUNING : -INTRO_TUNING);
      await saveSettings(tuned, storage); // 总线同步各页快照（>0 自动启用）
      return;
    }
    if (id === 'advance-now') {
      await pushAdvanceNow(tabsApi);
      return;
    }
```

`public/manifest.json` 的 `commands` 块在 `hold-toggle` 后追加（无 suggested_key——预置键位已满 4 个，grilling 已批）：

```json
    "intro-minus": {
      "description": "片头跳过 -5 秒（调到大于 0 自动启用）"
    },
    "intro-plus": {
      "description": "片头跳过 +5 秒（调到大于 0 自动启用）"
    },
    "advance-now": {
      "description": "立即续播（手动切下一个视频，不受总开关限制）"
    }
```

- [ ] **Step 4: 跑测试确认通过 + 构建 + 全量回归**

Run: `node --test tests/unit/notify.test.mjs tests/unit/background.test.mjs && npm run build && npm test`
Expected: notify 5/5、background 9/9；构建成功（manifest 合法）；全量 72/72（67 + 5）

- [ ] **Step 5: Commit**

```bash
git add src/shared/notify.js src/background/main.js public/manifest.json tests/unit/notify.test.mjs tests/unit/background.test.mjs
git commit -m "feat(m4): intro tuning and advance-now commands via storage bus

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: popup 跳过/续播区块

**Files:**
- Modify: `public/popup.html`
- Modify: `public/popup.css`
- Modify: `src/popup/main.js`

**Interfaces:**
- Consumes: Task 1 `clampSkip`；Task 5 `pushAdvanceNow`；现有 `saveSettings/loadSettings`
- Produces: DOM id 契约追加 `skip-intro`/`skip-outro`/`skip-switch`/`skip-label`/`advance-switch`/`advance-label`/`advance-now`；开关类词汇统一为 `.switch`/`.switch-dot`（原 `.hold-switch`/`.hold-dot` 随本任务改名，三处开关共用）

**无单测**（DOM 胶水，Task 7 /tabbit 验收）；验证 = 构建 + 全量绿。

- [ ] **Step 1: popup.html 两区块**（`hold-row` 之后、`pace-note` 之前插入）

```html
    <section class="slice">
      <div class="slice-title">跳过片段</div>
      <label class="slice-row"><span>片头</span><input type="number" id="skip-intro" min="0" max="3600" step="1" value="0" /><span class="unit">秒</span></label>
      <label class="slice-row"><span>片尾</span><input type="number" id="skip-outro" min="0" max="3600" step="1" value="0" /><span class="unit">秒</span></label>
      <button class="switch" id="skip-switch" type="button" aria-pressed="false">
        <span class="switch-dot" aria-hidden="true"></span><span id="skip-label">跳过：关</span>
      </button>
    </section>
    <section class="slice">
      <div class="slice-title">自动续播</div>
      <button class="switch" id="advance-switch" type="button" aria-pressed="false">
        <span class="switch-dot" aria-hidden="true"></span><span id="advance-label">续播：关</span>
      </button>
      <button class="go" id="advance-now" type="button">▶ 立即续播</button>
    </section>
```

同时保持行按钮类改为 `.switch`（`hold-switch`→`switch`、`hold-dot`→`switch-dot`，id 不变）。

- [ ] **Step 2: popup.css**——`.hold-switch`/`.hold-dot` 选择器改名 `.switch`/`.switch-dot`，追加：

```css
.slice { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--plate-edge); }
.slice-title { font-size: 12px; color: var(--ink-dim); margin-bottom: 8px; }
.slice-row {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; margin-bottom: 8px;
}
.slice-row input {
  width: 72px; padding: 4px 8px; border-radius: 8px;
  border: 1px solid var(--plate-edge);
  background: transparent; color: var(--ink);
  font-family: inherit; font-size: 13px; text-align: right;
}
.unit { font-size: 12px; color: var(--ink-dim); }
.go {
  margin-top: 8px; width: 100%; padding: 7px 12px;
  border-radius: 10px; border: 1px solid var(--plate-edge);
  background: transparent; color: var(--ink);
  font-family: inherit; font-size: 13px; cursor: pointer;
}
.go:hover { border-color: var(--glow); }
```

- [ ] **Step 3: src/popup/main.js 接线**

import 区补 `clampSkip`（自 `../shared/skipPlan.js`）与 `pushAdvanceNow`（自 `../shared/notify.js`）。元素引用区追加：

```js
const skipIntro = document.getElementById('skip-intro');
const skipOutro = document.getElementById('skip-outro');
const skipSwitch = document.getElementById('skip-switch');
const skipLabel = document.getElementById('skip-label');
const advanceSwitch = document.getElementById('advance-switch');
const advanceLabel = document.getElementById('advance-label');
const advanceNow = document.getElementById('advance-now');
let skipOn = false;      // 本弹窗会话快照
let autoAdvance = false; // 同上
```

`renderHold` 之后追加：

```js
function renderSkip() {
  skipSwitch.setAttribute('aria-pressed', String(skipOn));
  skipLabel.textContent = skipOn ? '跳过：开' : '跳过：关';
}
function renderAdvance() {
  advanceSwitch.setAttribute('aria-pressed', String(autoAdvance));
  advanceLabel.textContent = autoAdvance ? '续播：开' : '续播：关';
}
```

chipsBox 监听之后追加交互（数值输入失焦提交、开关即时、立即续播带反馈）：

```js
async function commitSkip() {
  await saveSettings({
    introSkip: clampSkip(skipIntro.value),
    outroSkip: clampSkip(skipOutro.value),
  });
}
skipIntro.addEventListener('change', commitSkip);
skipOutro.addEventListener('change', commitSkip);

skipSwitch.addEventListener('click', async () => {
  skipOn = !skipOn;
  renderSkip();
  await saveSettings({ skipOn });
});

advanceSwitch.addEventListener('click', async () => {
  autoAdvance = !autoAdvance;
  renderAdvance();
  await saveSettings({ autoAdvance });
});

advanceNow.addEventListener('click', async () => {
  advanceNow.textContent = '⏳ 查找中…';
  const ok = await pushAdvanceNow();
  advanceNow.textContent = ok ? '✓ 已触发' : '⚠ 未找到下一节入口';
  setTimeout(() => { advanceNow.textContent = '▶ 立即续播'; }, 1500);
});
```

初始化 IIFE 中 `renderHold(settings.heldPace)` 之后追加：

```js
  skipOn = !!settings.skipOn;
  autoAdvance = !!settings.autoAdvance;
  skipIntro.value = String(settings.introSkip);
  skipOutro.value = String(settings.outroSkip);
  renderSkip();
  renderAdvance();
```

（原保持行 html 的类名改动同步到本文件无需 js 变更——`holdSwitch` 引用按 id 取，不受类名影响。）

- [ ] **Step 4: 构建 + 全量回归**

Run: `npm run build && npm test`
Expected: 构建成功；72/72

- [ ] **Step 5: 人工对照参考源（防抄袭门禁）**

对照参考 popup 的 skip-section/autonext-section（`skipStart/skipEnd/skipToggle/autoNextToggle/nextNowBtn`、`sendSkip/setAutoNext/nextVideo` 后台往返）：本实现直写存储 + `pushAdvanceNow` 直推、id/文案/结构（分区 `.slice` + 统一 `.switch` 词汇）全自定。在报告中记录比对结论。

- [ ] **Step 6: Commit**

```bash
git add public/popup.html public/popup.css src/popup/main.js
git commit -m "feat(m4): popup skip and advance sections with unified switch vocabulary

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: /tabbit 验收（验收 #5、#6）+ 并排相似度自查 + 证据沉淀

**Files:**
- Create: `docs/verification/m4.md`
- Modify: `docs/MILESTONES.md`、本计划勾选框

**Interfaces:**
- Consumes: Task 1–6 产物（构建后的 `extension/`）
- Produces: 验收 #5/#6 通过证据 + 里程碑整体并排相似度自查结论 + M4 关账

- [ ] **Step 1: 构建 + 用户重载扩展**

Run: `npm run build`
请用户在 chrome://extensions 点「重新加载 ↻」。

- [ ] **Step 2: 用户一次性设置 + tabbit 自动化验收（#5/#6 全链路）**

请用户在测试页 popup 中：片头设 `10`、片尾设 `3600`、开「跳过」、开「自动续播」。
tabbit 单程序（无需更多人工）：`video.play()` → 轮询 `currentTime`（预期 ≥10，验收 #5 片头）→ 轮询至 `currentTime` 跳至 ≈duration（片尾 toEnd）→ 等 `ended` + 300ms → 观察页面导航/新视频出现（自动续播点击下一节，验收 #6）→ 读新页 `rate`（保持仍开则应为 heldPace）。任一步失败按自主迭代循环修复（3 连败停）。

- [ ] **Step 3: 手动续播目检（#6 另一半）**

请用户点 popup「立即续播」→ 反馈按钮状态文案（✓/⚠）；tabbit 读页面变化佐证。

- [ ] **Step 4: 并排相似度自查（自主迭代纪律的里程碑级门禁）**

控制器并排对照 `src/`+`public/` 与 `fjhe.../2.1.0_0/` 全部对应文件：标识符零清单、结构差异清单、行为参数对齐清单（0.07–16/0.25/800ms/8/300ms/1200ms/±5s 等）。结论写入 `docs/verification/m4.md`。

- [ ] **Step 5: 证据沉淀与勾账**

`docs/verification/m4.md`（时间线/触发方式/降级路径/自查结论）；`MILESTONES.md` M4 ✅ + 证据行；commit 同前例（`docs(m4): acceptance evidence ...`）。

---

## Self-Review 记录

- **规格覆盖**：验收 #5（Task 7 Step 2 前半 + skipPlan 单测）、#6（Step 2 后半 + Step 3 + advance 单测）；行为规格表逐项落位（启用即生效 introSweep、循环暂停/普通 toEnd、±5 自动启用、300ms 站点连播避让、手动续播不受限）；3 命令 + 无键位说明（Task 5）；并排自查（Task 7 Step 4）。
- **占位符扫描**：无 TBD/空泛步骤；所有代码块完整。
- **类型一致性**：`skip`/`advance` 快照对象字段在 Task 4 内自洽；`RUN_ADVANCE` 字面量 Task 4 定义、Task 5/6 消费一致；`makeAdvance` 注入缝 Task 4 定义并在测试使用；`.switch` 改名 Task 6 内 html/css 同步；测试计数 56→60→62→67→72 逐任务对齐（基线含 M3 fix wave 2 项）。
- **已知取舍**：collect/poke/runAdvance 胶水不单测（Task 7 实测）；popup 区块无单测（M2/M3 同例）；`__defineSetter__` 测试手法仅用于 FakeVideo 的 currentTime 模拟。
