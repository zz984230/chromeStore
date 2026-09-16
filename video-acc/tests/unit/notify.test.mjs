// tests/unit/notify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { nudgeActiveTab } from '../../src/shared/notify.js';
import { APPLY_PACE } from '../../src/shared/protocol.js';

function tabsFake({ tabId = 1, fail = false } = {}) {
  const sent = [];
  return {
    sent,
    api: {
      query: async () => (tabId == null ? [] : [{ id: tabId }]),
      sendMessage: async (id, msg) => {
        if (fail) throw new Error('Could not establish connection');
        sent.push({ id, msg });
      },
    },
  };
}

test('推送到活动标签页成功', async () => {
  const { api, sent } = tabsFake({ tabId: 42 });
  assert.equal(await nudgeActiveTab(1.5, api), true);
  assert.deepEqual(sent, [{ id: 42, msg: { vpa: APPLY_PACE, pace: 1.5 } }]);
});

test('发送失败（受限页）返回 false 不抛', async () => {
  const { api } = tabsFake({ fail: true });
  assert.equal(await nudgeActiveTab(2, api), false);
});

test('无活动标签页返回 false', async () => {
  const { api } = tabsFake({ tabId: null });
  assert.equal(await nudgeActiveTab(2, api), false);
});
