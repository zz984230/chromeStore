// tests/unit/content-main.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { wireContent } from '../../src/content/main.js';
import { APPLY_PACE, PROBE_PACE } from '../../src/shared/protocol.js';
import { RUN_ADVANCE } from '../../src/shared/protocol.js';

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.nodeType = 1; // 过 discovery harvest 的元素节点门（同 tests/unit/discovery.test.mjs 先例）
    this.tagName = 'VIDEO';
    this.loop = false;
    this.duration = NaN;
    this.currentTime = 0;
    this.paused = true;
  }
  fire(type) { this.dispatchEvent(new Event(type)); } // 同 tests/unit/keeper.test.mjs 先例
}
class FakeObserver {
  static instances = [];
  constructor(cb) { this.cb = cb; FakeObserver.instances.push(this); }
  observe() {}
  disconnect() {}
}
function fakeRuntime() {
  const listeners = [];
  return {
    listeners,
    onMessage: { addListener: (fn) => listeners.push(fn) },
  };
}
function fakeDoc(videos) {
  return {
    documentElement: {},
    querySelectorAll: (sel) => (sel === 'video' ? [...videos] : []),
  };
}
function makeChip() {
  const flashes = [];
  return { chip: { flash: (t) => flashes.push(t) }, flashes };
}

test('pace.apply 施档到当前视频并回应', () => {
  const v1 = new FakeVideo(), v2 = new FakeVideo();
  const runtime = fakeRuntime();
  const { chip } = makeChip();
  wireContent({
    runtime, doc: fakeDoc([v1, v2]),
    MutationObserver: FakeObserver, setInterval: () => 0,
    makeChip: () => chip,
  });
  let reply = null;
  runtime.listeners[0]({ vpa: APPLY_PACE, pace: 2 }, {}, (r) => { reply = r; });
  assert.equal(v1.playbackRate, 2);
  assert.equal(v2.playbackRate, 2);
  assert.deepEqual(reply, { ok: true, pace: 2 });
});

test('probe 反映最近施档，未施档为 null', () => {
  const runtime = fakeRuntime();
  const { chip } = makeChip();
  wireContent({
    runtime, doc: fakeDoc([new FakeVideo()]),
    MutationObserver: FakeObserver, setInterval: () => 0,
    makeChip: () => chip,
  });
  let reply = null;
  runtime.listeners[0]({ vpa: PROBE_PACE }, {}, (r) => { reply = r; });
  assert.deepEqual(reply, { pace: null });
  runtime.listeners[0]({ vpa: APPLY_PACE, pace: 1.5 }, {}, () => {});
  runtime.listeners[0]({ vpa: PROBE_PACE }, {}, (r) => { reply = r; });
  assert.deepEqual(reply, { pace: 1.5 });
});

test('无关消息静默忽略', () => {
  const runtime = fakeRuntime();
  const { chip } = makeChip();
  wireContent({
    runtime, doc: fakeDoc([]),
    MutationObserver: FakeObserver, setInterval: () => 0,
    makeChip: () => chip,
  });
  let called = false;
  runtime.listeners[0]({ something: 'else' }, {}, () => { called = true; });
  assert.equal(called, false);
});

class MemoryStorage {
  constructor(initial = {}) { this.data = structuredClone(initial); this.listeners = new Set(); }
  get(key, cb) { cb(key in this.data ? { [key]: this.data[key] } : {}); }
  set(obj, cb) { Object.assign(this.data, obj); cb(); }
  emit(obj) { const changes = {}; for (const k of Object.keys(obj)) changes[k] = { newValue: obj[k] }; for (const l of this.listeners) l(changes, 'local'); }
  get onChanged() { return { addListener: (l) => this.listeners.add(l), removeListener: (l) => this.listeners.delete(l) }; }
}
const SETTINGS = 'vpa.settings';

test('启动快照：hold 开启时对现存视频施记忆档位（🔒 浮标）', async () => {
  const v = new FakeVideo();
  const runtime = fakeRuntime();
  const flashes = [];
  const { chip } = { chip: { flash: (t) => flashes.push(t) } };
  const mem = new MemoryStorage({ [SETTINGS]: { pace: 2, hold: true, heldPace: 2 } });
  wireContent({
    runtime, storage: mem, doc: fakeDoc([v]),
    MutationObserver: FakeObserver, setInterval: () => 0,
    makeChip: () => chip,
  });
  await new Promise((r) => setTimeout(r, 0)); // 等 loadSettings 微任务
  assert.equal(v.playbackRate, 2, '刷新后自动恢复记忆档位');
  assert.deepEqual(flashes, ['🔒 2×']);
});

test('发现的新视频在保持模式下自动套用', async () => {
  const runtime = fakeRuntime();
  const flashes = [];
  const chip = { flash: (t) => flashes.push(t) };
  const mem = new MemoryStorage({ [SETTINGS]: { pace: 2, hold: true, heldPace: 2 } });
  const videos = [];
  const doc = { documentElement: {}, querySelectorAll: (sel) => (sel === 'video' ? videos : []) };
  wireContent({
    runtime, storage: mem, doc,
    MutationObserver: FakeObserver, setInterval: () => 0,
    makeChip: () => chip,
  });
  await new Promise((r) => setTimeout(r, 0)); // 快照就位
  const late = new FakeVideo();
  videos.push(late);
  // 触发一次 observer 批次模拟新视频插入
  const obs = FakeObserver.instances.at(-1);
  obs.cb([{ addedNodes: [late] }]);
  assert.equal(late.playbackRate, 2, '新视频自动套用记忆档位');
  assert.deepEqual(flashes, ['🔒 2×']);
});

test('订阅回声：hold 下跨页套用为静默；hold 关闭时 pace 变更不套用', async () => {
  const v = new FakeVideo();
  const runtime = fakeRuntime();
  const flashes = [];
  const chip = { flash: (t) => flashes.push(t) };
  const mem = new MemoryStorage({ [SETTINGS]: { pace: 1, hold: false, heldPace: 1 } });
  wireContent({
    runtime, storage: mem, doc: fakeDoc([v]),
    MutationObserver: FakeObserver, setInterval: () => 0,
    makeChip: () => chip,
  });
  await new Promise((r) => setTimeout(r, 0));
  // hold 关闭：外部 pace 变更回声 → 不套用（活动页已由直推处理）
  mem.emit({ [SETTINGS]: { pace: 3, hold: false, heldPace: 1 } });
  assert.equal(v.playbackRate, 1, 'hold 关闭时回声不施档');
  // hold 开启：heldPace 变更 → 静默套用
  mem.emit({ [SETTINGS]: { pace: 3, hold: true, heldPace: 3 } });
  assert.equal(v.playbackRate, 3, 'hold 开启时跨页套用');
  assert.deepEqual(flashes, [], '回声套用全程静默');
});

test('保持关闭时发现的新视频不被施档', async () => {
  const late = new FakeVideo();
  const videos = [late];
  const doc = { documentElement: {}, querySelectorAll: (sel) => (sel === 'video' ? videos : []) };
  const mem = new MemoryStorage({ [SETTINGS]: { pace: 2, hold: false, heldPace: 2 } });
  wireContent({ runtime: fakeRuntime(), storage: mem, doc, MutationObserver: FakeObserver, setInterval: () => 0, makeChip: () => ({ flash: () => {} }) });
  await new Promise((r) => setTimeout(r, 0));
  FakeObserver.instances.at(-1).cb([{ addedNodes: [late] }]);
  assert.equal(late.playbackRate, 1, 'hold 关闭不施档');
});

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
