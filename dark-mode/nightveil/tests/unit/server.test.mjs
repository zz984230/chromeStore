// tests/unit/server.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

test('fixtures server serves index.html and 404s unknown paths', async () => {
  // Reserve a free port so the test never collides with a real fixtures server.
  const probe = createServer();
  const port = await new Promise((res) => {
    probe.listen(0, () => res(probe.address().port));
  });
  await new Promise((res) => probe.close(res));

  const child = spawn(process.execPath, ['scripts/serve-fixtures.mjs'], {
    env: { ...process.env, FIXTURES_PORT: String(port) },
    stdio: 'ignore',
  });
  try {
    let res;
    for (let i = 0; i < 20 && !res; i++) {
      try {
        res = await fetch(`http://localhost:${port}/`);
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    assert.ok(res, 'server never came up');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /Fixture stub/);

    const missing = await fetch(`http://localhost:${port}/nope.html`);
    assert.equal(missing.status, 404);
  } finally {
    child.kill();
  }
});
