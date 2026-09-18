// tests/unit/notify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { nudgeActiveTab } from '../../src/shared/notify.js';
import { pushAdvanceNow } from '../../src/shared/notify.js';
import { APPLY_PACE } from '../../src/shared/protocol.js';
import { RUN_ADVANCE } from '../../src/shared/protocol.js';

const REPLY = { ok: true, pace: 1.5 };

function tabsFake({ tabId = 1, fail = false } = {}) {
  const sent = [];
  return {
    sent,
    api: {
      query: async () => (tabId == null ? [] : [{ id: tabId }]),
      sendMessage: async (id, msg) => {
        if (fail) throw new Error('Could not establish connection');
        sent.push({ id, msg });
        return { ...REPLY };
      },
    },
  };
}

test('推送到活动标签页成功', async () => {
  const { api, sent } = tabsFake({ tabId: 42 });
  assert.deepEqual(await nudgeActiveTab(1.5, api), REPLY);
  assert.deepEqual(sent, [{ id: 42, msg: { vpa: APPLY_PACE, pace: 1.5 } }]);
});

test('发送失败（受限页）返回 null 不抛', async () => {
  const { api } = tabsFake({ fail: true });
  assert.equal(await nudgeActiveTab(2, api), null);
});

test('无活动标签页返回 null', async () => {
  const { api } = tabsFake({ tabId: null });
  assert.equal(await nudgeActiveTab(2, api), null);
});

test('pushAdvanceNow 推送 advance.run 到活动页', async () => {
  const { api, sent } = tabsFake({ tabId: 7 });
  assert.equal(await pushAdvanceNow(api), true);
  assert.deepEqual(sent, [{ id: 7, msg: { vpa: RUN_ADVANCE } }]);
});

test('pushAdvanceNow 失败返回 false 不抛', async () => {
  const { api } = tabsFake({ fail: true });
  assert.equal(await pushAdvanceNow(api), false);
});
