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

test('applyAll 施档：速率、意图、最近档位、浮标（用户驱动）', () => {
  const deps = makeDeps();
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 2);
  assert.equal(v.playbackRate, 2);
  assert.equal(v.defaultPlaybackRate, 2);
  assert.equal(keeper.intentOf(v), 2);
  assert.equal(keeper.lastPace(), 2);
  assert.deepEqual(deps.flashed, ['2×']);
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
  assert.equal(deps.flashed.length, 1);
  v.playbackRate = 1; v.fire('ratechange');
  assert.equal(v.playbackRate, 2, '恢复');
  assert.equal(deps.flashed.length, 1, '恢复不再闪浮标');
  assert.equal(resets.length, 1, '仅用户驱动那一次 reset');
});

test('熔断后不再恢复', () => {
  const deps = makeDeps();
  deps.trip.allows = () => false; // 已熔断
  const keeper = createKeeper({ trip: deps.trip, chip: deps.chip });
  const v = new FakeVideo();
  keeper.applyAll([v], 2);
  v.playbackRate = 1; v.fire('ratechange');
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
