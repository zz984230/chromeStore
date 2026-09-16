// tests/unit/content-main.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { wireContent } from '../../src/content/main.js';
import { APPLY_PACE, PROBE_PACE } from '../../src/shared/protocol.js';

class FakeVideo extends EventTarget {
  constructor() { super(); this.playbackRate = 1; this.defaultPlaybackRate = 1; }
}
class FakeObserver {
  constructor(cb) { this.cb = cb; }
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
