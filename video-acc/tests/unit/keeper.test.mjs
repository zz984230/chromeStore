// tests/unit/keeper.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeeper } from '../../src/content/keeper.js';

// 最小视频形状：EventTarget + 速率字段（ratechange 不自动触发，由测试手动 fire）
class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
  }
  fire(type) { this.dispatchEvent(new Event(type)); }
}

function makeDeps() {
  const flashed = [];
  const allowed = [];
  return {
    flashed,
    trip: { allows: (k) => { allowed.push(k); return true; }, reset: () => {} },
    chip: { flash: (text) => flashed.push(text) },
    allowed,
  };
}

function deps_free() {
  return { trip: { allows: () => true, reset: () => {} }, chip: { flash: () => {} } };
}

test('applyAll 施档：速率、意图、最近档位、浮标（显式副作用）', () => {
  const deps = makeDeps();
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 2, { resetTrip: true, flashText: '2×' });
  assert.equal(v.playbackRate, 2);
  assert.equal(v.defaultPlaybackRate, 2);
  assert.equal(keeper.intentOf(v), 2);
  assert.equal(keeper.lastPace(), 2);
  assert.deepEqual(deps.flashed, ['2×'], '浮标文本由调用方给定');
});

test('默认静默：无 opts 不闪浮标不复位熔断', () => {
  const deps = makeDeps();
  const resets = [];
  deps.trip.reset = (k) => resets.push(k);
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 1.5);
  assert.equal(v.playbackRate, 1.5);
  assert.deepEqual(deps.flashed, [], '默认不闪');
  assert.deepEqual(resets, [], '默认不复位');
});

test('保持施档文本带 🔒 前缀由调用方传入', () => {
  const deps = makeDeps();
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 2, { resetTrip: true, flashText: '🔒 2×' });
  assert.deepEqual(deps.flashed, ['🔒 2×']);
});

test('attach 幂等：重复 attach 不重复挂监听', () => {
  const deps = makeDeps();
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  const wired = [];
  const orig = v.addEventListener.bind(v);
  v.addEventListener = (type, fn, opts) => { wired.push(type); return orig(type, fn, opts); };
  keeper.attach(v);
  keeper.attach(v);
  assert.deepEqual(wired, ['ratechange', 'loadedmetadata', 'play'], '监听只挂一组');
});

test('自己设速不触发守速（自激抑制）', async () => {
  const deps = makeDeps();
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 1.5);
  v.fire('ratechange'); // 施档后的同步自激事件
  assert.equal(deps.allowed.length, 0, '自激事件不进入守速判定');
  assert.equal(v.playbackRate, 1.5);
  await new Promise((r) => setTimeout(r, 0)); // 微任务后抑制标记清除
  v.playbackRate = 1; v.fire('ratechange'); // 站点覆盖
  assert.equal(deps.allowed.length, 1, '站点覆盖进入守速判定');
  assert.equal(v.playbackRate, 1.5, '守速恢复到意图档位');
});

test('守速恢复是静默的：不闪浮标、不复位熔断', async () => {
  const deps = makeDeps();
  const resets = [];
  deps.trip.reset = (k) => resets.push(k);
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 2);
  await new Promise((r) => setTimeout(r, 0)); // 微任务后抑制标记清除
  assert.equal(deps.flashed.length, 0);
  v.playbackRate = 1; v.fire('ratechange');
  assert.equal(v.playbackRate, 2, '恢复');
  assert.equal(deps.flashed.length, 0, '恢复不再闪浮标');
  assert.equal(resets.length, 0, '施档与守速恢复均不复位');
});

test('熔断后不再恢复', async () => {
  const deps = makeDeps();
  deps.trip.allows = (k) => { deps.allowed.push(k); return false; }; // 已熔断
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 2);
  await new Promise((r) => setTimeout(r, 0)); // 微任务后抑制标记清除
  v.playbackRate = 1; v.fire('ratechange');
  assert.equal(deps.allowed.length, 1, '守速判定被询问（熔断门生效）');
  assert.equal(v.playbackRate, 1, '熔断后守速停手');
});

test('换源（loadedmetadata）重套意图档位', async () => {
  const deps = makeDeps();
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 2);
  await new Promise((r) => setTimeout(r, 0));
  v.playbackRate = 1; // 站点换源后重置
  v.fire('loadedmetadata');
  assert.equal(v.playbackRate, 2, '换源后重套');
});

test('播放时漂移则纠回（play）', async () => {
  const deps = makeDeps();
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 3);
  await new Promise((r) => setTimeout(r, 0));
  v.playbackRate = 1;
  v.fire('play');
  assert.equal(v.playbackRate, 3, '播放时纠回意图档位');
});

test('未施过档的视频不受事件影响', () => {
  const deps = makeDeps();
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.attach(v);
  v.playbackRate = 4; v.fire('ratechange');
  assert.equal(v.playbackRate, 4, '无意图则不干预');
  assert.equal(keeper.lastPace(), null);
});

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
