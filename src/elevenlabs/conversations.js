const { ElevenLabsError } = require('./client');

async function getConversationToken(client, agentId) {
  const res = await client.get('/v1/convai/conversation/token', { query: { agent_id: agentId } });
  return { token: res.token, conversationId: res.conversation_id };
}

async function getConversation(client, conversationId) {
  return client.get(`/v1/convai/conversations/${encodeURIComponent(conversationId)}`);
}

async function getConversationAudio(client, conversationId) {
  return client.get(`/v1/convai/conversations/${encodeURIComponent(conversationId)}/audio`, { responseType: 'buffer' });
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until ElevenLabs has finished post-processing the call (transcript is final). */
async function waitForConversation(client, conversationId, { timeoutMs = 30000, intervalMs = 2000, sleep = defaultSleep, now = Date.now } = {}) {
  const start = now();
  for (;;) {
    const conv = await getConversation(client, conversationId);
    if (conv.status === 'done') return conv;
    if (conv.status === 'failed') {
      throw new ElevenLabsError(`Conversation ${conversationId} failed on ElevenLabs`, { code: 'failed' });
    }
    if (now() - start >= timeoutMs) {
      throw new ElevenLabsError(`Conversation ${conversationId} not finalised after ${timeoutMs}ms (status ${conv.status})`, { code: 'timeout' });
    }
    await sleep(intervalMs);
  }
}

/** ElevenLabs "user" is the trainee (our "agent"); ElevenLabs "agent" is the AI customer. */
function mapTranscript(transcript) {
  const out = [];
  for (const t of transcript || []) {
    const message = typeof t.message === 'string' ? t.message.trim() : '';
    if (!message) continue;
    out.push({
      role: t.role === 'user' ? 'agent' : 'customer',
      message,
      elapsed: Number.isFinite(t.time_in_call_secs) ? t.time_in_call_secs : 0,
    });
  }
  return out;
}

function transcriptToText(entries) {
  return entries.map((t) => `${t.role === 'agent' ? 'Agent' : 'Customer'}: ${t.message}`).join('\n');
}

module.exports = { getConversationToken, getConversation, getConversationAudio, waitForConversation, mapTranscript, transcriptToText };
