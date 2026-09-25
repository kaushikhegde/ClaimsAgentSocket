const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { mountSpa } = require('../src/spa');

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

describe('SPA fallback', () => {
  let dir, server, base;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>claims app</html>');
    const app = express();
    app.get('/api/ping', (req, res) => res.json({ ok: true }));
    assert.strictEqual(mountSpa(app, dir), true);
    ({ server, base } = await listen(app));
  });

  after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html for client-side routes', async () => {
    const res = await fetch(`${base}/sessions/5`);
    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /claims app/);
  });

  it('leaves API routes alone', async () => {
    const res = await fetch(`${base}/api/ping`);
    assert.deepStrictEqual(await res.json(), { ok: true });
  });

  it('keeps unknown API paths and /health as real 404s', async () => {
    for (const p of ['/api/nope', '/api', '/health']) {
      const res = await fetch(`${base}${p}`);
      assert.strictEqual(res.status, 404, p);
    }
  });

  it('only answers GET/HEAD', async () => {
    const res = await fetch(`${base}/sessions/5`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
  });

  it('does nothing when no frontend build is present', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-empty-'));
    const app = express();
    assert.strictEqual(mountSpa(app, empty), false);
    const { server: s, base: b } = await listen(app);
    try {
      assert.strictEqual((await fetch(`${b}/sessions/5`)).status, 404);
    } finally {
      s.close();
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
