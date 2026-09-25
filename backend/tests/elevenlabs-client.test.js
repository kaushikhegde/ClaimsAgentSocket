const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createClient, ElevenLabsError } = require('../src/elevenlabs/client');

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = handler(String(url), init);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (r.contentType || 'application/json') : null) },
      json: async () => r.body,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
      arrayBuffer: async () => { const b = r.buffer || Buffer.from(''); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    };
  };
  return { fetchImpl, calls };
}

describe('elevenlabs client', () => {
  it('sends the api key header and query params, parses json', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: { voices: [] } }));
    const client = createClient({ apiKey: 'sk_test', fetchImpl });
    const out = await client.get('/v2/voices', { query: { page_size: 3, search: 'Em ma' } });
    assert.deepStrictEqual(out, { voices: [] });
    assert.strictEqual(calls[0].url, 'https://api.elevenlabs.io/v2/voices?page_size=3&search=Em+ma');
    assert.strictEqual(calls[0].init.headers['xi-api-key'], 'sk_test');
  });

  it('serialises json bodies', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: { agent_id: 'a1' } }));
    const client = createClient({ apiKey: 'k', fetchImpl });
    await client.post('/v1/convai/agents/create', { json: { name: 'x' } });
    assert.strictEqual(calls[0].init.method, 'POST');
    assert.strictEqual(calls[0].init.headers['content-type'], 'application/json');
    assert.strictEqual(calls[0].init.body, JSON.stringify({ name: 'x' }));
  });

  it('maps error statuses to codes and keeps the detail', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 401, body: { detail: { status: 'invalid_api_key', message: 'bad' } } }));
    const client = createClient({ apiKey: 'k', fetchImpl });
    await assert.rejects(() => client.get('/v1/user/subscription'), (err) => {
      assert.ok(err instanceof ElevenLabsError);
      assert.strictEqual(err.status, 401);
      assert.strictEqual(err.code, 'unauthorized');
      assert.strictEqual(err.detail, 'bad');
      return true;
    });
  });

  it('maps quota_exceeded to quota and 404 to not_found', async () => {
    const q = fakeFetch(() => ({ status: 402, body: { detail: { status: 'quota_exceeded', message: 'no credits' } } }));
    await assert.rejects(() => createClient({ apiKey: 'k', fetchImpl: q.fetchImpl }).get('/x'), (e) => e.code === 'quota');
    const n = fakeFetch(() => ({ status: 404, body: { detail: 'missing' } }));
    await assert.rejects(() => createClient({ apiKey: 'k', fetchImpl: n.fetchImpl }).get('/x'), (e) => e.code === 'not_found' && e.detail === 'missing');
  });

  it('returns a Buffer for responseType buffer', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 200, buffer: Buffer.from('mp3bytes'), contentType: 'audio/mpeg' }));
    const client = createClient({ apiKey: 'k', fetchImpl });
    const buf = await client.get('/v1/convai/conversations/c1/audio', { responseType: 'buffer' });
    assert.ok(Buffer.isBuffer(buf));
    assert.strictEqual(buf.toString(), 'mp3bytes');
  });
});
