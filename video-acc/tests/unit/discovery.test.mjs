// tests/unit/discovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startDiscovery } from '../../src/content/discovery.js';

class FakeVideo extends EventTarget {
  nodeType = 1;
  tagName = 'VIDEO';
}

// 可编程 MutationObserver 假体：记录回调，供测试手动触发
class FakeObserver {
  static instances = [];
  constructor(cb) { this.cb = cb; FakeObserver.instances.push(this); }
  observe() {}
  disconnect() { this.disconnected = true; }
}

function makeDoc(videos = []) {
  return {
    documentElement: {},
    querySelectorAll: (sel) => (sel === 'video' ? [...videos] : []),
  };
}

test('启动即全量扫描：新视频交给 onFound，已接管的不重复', () => {
  const v1 = new FakeVideo(), v2 = new FakeVideo();
  const found = [];
  const kept = new Set([v1]);
  startDiscovery({
    doc: makeDoc([v1, v2]),
    onFound: (v) => found.push(v),
    isKept: (v) => kept.has(v),
    MutationObserver: FakeObserver,
    setInterval: () => 0,
  });
  assert.deepEqual(found, [v2]);
});

test('新增 DOM 节点收割：直接 video 与子树内 video', () => {
  const found = [];
  const kept = new Set();
  const video = new FakeVideo();
  const video2 = new FakeVideo();
  const doc = makeDoc();
  startDiscovery({
    doc, onFound: (v) => found.push(v), isKept: (v) => kept.has(v),
    MutationObserver: FakeObserver, setInterval: () => 0,
  });
  const obs = FakeObserver.instances.at(-1);
  const wrapper = {
    nodeType: 1, tagName: 'DIV',
    querySelectorAll: (sel) => (sel === 'video' ? [video2] : []),
  };
  obs.cb([{ addedNodes: [video, wrapper, { nodeType: 3 }] }]);
  assert.deepEqual(found, [video, video2], '直接 video 与子树 video 各贡献一个');
});

test('stop 断开 observer', () => {
  const handle = startDiscovery({
    doc: makeDoc(), onFound: () => {}, isKept: () => false,
    MutationObserver: FakeObserver, setInterval: () => 0,
  });
  handle.stop();
  assert.equal(FakeObserver.instances.at(-1).disconnected, true);
});

test('周期兜底与 stop 的 timer 清理', () => {
  let tick, tickMs;
  const orig = globalThis.clearInterval;
  let clearedId;
  globalThis.clearInterval = (id) => { clearedId = id; };
  try {
    const handle = startDiscovery({
      doc: makeDoc(), onFound: () => {}, isKept: () => false,
      MutationObserver: FakeObserver,
      setInterval: (fn, ms) => { tick = fn; tickMs = ms; return 7; },
    });
    assert.ok(typeof tick === 'function', 'setInterval 收到可调用的扫描函数');
    assert.equal(tickMs, 1200, '默认 pollMs 作为入参传给 timer');
    handle.stop();
    assert.equal(clearedId, 7, 'stop 清理注入 timer 返回的 id');
  } finally {
    globalThis.clearInterval = orig;
  }
});
