const { describe, it } = require('node:test');
const assert = require('node:assert');
const { getConversationToken, waitForConversation, mapTranscript, transcriptToText } = require('../src/elevenlabs/conversations');

describe('conversations', () => {
  it('fetches a webrtc token with the agent id', async () => {
    const calls = [];
    const client = { async get(path, opts) { calls.push([path, opts]); return { token: 'tok', conversation_id: 'conv_1' }; } };
    const out = await getConversationToken(client, 'agent_1');
    assert.deepStrictEqual(out, { token: 'tok', conversationId: 'conv_1' });
    assert.strictEqual(calls[0][0], '/v1/convai/conversation/token');
    assert.deepStrictEqual(calls[0][1].query, { agent_id: 'agent_1' });
  });

  it('maps roles, drops empty messages and keeps elapsed seconds', () => {
    const entries = mapTranscript([
      { role: 'agent', message: 'Hi, I hurt my chest.', time_in_call_secs: 0 },
      { role: 'user', message: 'Sorry to hear that. What is your name?', time_in_call_secs: 4 },
      { role: 'agent', message: null, time_in_call_secs: 9, tool_calls: [{ name: 'end_call' }] },
      { role: 'agent', message: '   ', time_in_call_secs: 10 },
      { role: 'user', message: 'Bye', time_in_call_secs: 12 },
    ]);
    assert.deepStrictEqual(entries, [
      { role: 'customer', message: 'Hi, I hurt my chest.', elapsed: 0 },
      { role: 'agent', message: 'Sorry to hear that. What is your name?', elapsed: 4 },
      { role: 'agent', message: 'Bye', elapsed: 12 },
    ]);
    assert.strictEqual(transcriptToText(entries), 'Customer: Hi, I hurt my chest.\nAgent: Sorry to hear that. What is your name?\nAgent: Bye');
  });

  it('polls until done', async () => {
    const statuses = ['processing', 'processing', 'done'];
    let i = 0;
    const client = { async get() { return { status: statuses[i++], transcript: [] }; } };
    const slept = [];
    const out = await waitForConversation(client, 'c', { intervalMs: 5, timeoutMs: 1000, sleep: async (ms) => { slept.push(ms); } });
    assert.strictEqual(out.status, 'done');
    assert.strictEqual(slept.length, 2);
  });

  it('throws timeout when never done, and failed when the call failed', async () => {
    let now = 0;
    const clock = () => now;
    const client = { async get() { now += 600; return { status: 'processing' }; } };
    await assert.rejects(() => waitForConversation(client, 'c', { intervalMs: 1, timeoutMs: 1000, sleep: async () => {}, now: clock }), (e) => e.code === 'timeout');
    const failed = { async get() { return { status: 'failed' }; } };
    await assert.rejects(() => waitForConversation(failed, 'c', { sleep: async () => {} }), (e) => e.code === 'failed');
  });
});
