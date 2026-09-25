// Proves the API key and scopes work end-to-end: create agent → upload doc →
// attach → index → token → delete everything. Run: node scripts/elevenlabs-smoke.js
const config = require('../src/config');
const { getClient } = require('../src/elevenlabs/client');
const agents = require('../src/elevenlabs/agents');
const kb = require('../src/elevenlabs/knowledgeBase');
const conversations = require('../src/elevenlabs/conversations');
const voices = require('../src/elevenlabs/voices');

const ok = (m) => console.log(`✔ ${m}`);
const fail = (m, e) => { console.log(`✘ ${m}: ${e.message}${e.detail && !e.message.includes(e.detail) ? ` — ${e.detail}` : ''}`); process.exitCode = 1; };

(async () => {
  const client = getClient();
  let agentId = null; let docId = null;
  try {
    const sub = voices.summariseUsage(await voices.getSubscription(client));
    ok(`subscription tier=${sub.tier} credits ${sub.creditsUsed}/${sub.creditsLimit} voices ${sub.voiceSlotsUsed}/${sub.voiceSlotsLimit}`);

    const list = await voices.listVoices(client, { accent: 'australian' });
    if (list.length === 0) throw new Error('no Australian voices in account');
    ok(`voices: ${list.length} australian (e.g. ${list[0].name})`);

    const doc = await kb.uploadFile(client, { buffer: Buffer.from('Smoke test document. The claimant policy number is WC-SMOKE-0001.'), filename: 'smoke.txt', mimeType: 'text/plain', name: 'smoke.txt' });
    docId = doc.id; ok(`knowledge base upload id=${docId}`);

    const scenario = { id: 'smoke-test', name: 'Smoke Test', maxDurationSeconds: 60, defaultVoiceId: list[0].voiceId, documents: [{ name: 'smoke.txt', elDocumentId: docId }] };
    const payload = agents.buildAgentPayload(scenario, config.elevenlabs);
    agentId = await agents.createAgent(client, payload);
    ok(`agent created id=${agentId}`);

    await agents.updateAgent(client, agentId, payload);
    ok('agent patched');

    const idx = await kb.computeRagIndex(client, docId, config.elevenlabs.ragModel);
    ok(`rag index status=${idx.status} (${kb.mapIndexStatus(idx.status)})`);

    const tok = await conversations.getConversationToken(client, agentId);
    ok(`conversation token issued, conversation_id=${tok.conversationId}`);
  } catch (e) {
    fail('smoke step', e);
  } finally {
    if (agentId) { try { await agents.deleteAgent(client, agentId); ok('agent deleted'); } catch (e) { fail('agent delete', e); } }
    if (docId) { try { await kb.deleteDocument(client, docId); ok('document deleted'); } catch (e) { fail('document delete', e); } }
  }
})();
