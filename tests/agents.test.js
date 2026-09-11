const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildAgentPayload } = require('../src/elevenlabs/agents');
const { syncAgent, ensureAgent, resolveDefaultVoice } = require('../src/training/scenarioSync');
const { SYSTEM_PROMPT_TEMPLATE } = require('../src/training/prompts');

const scenario = {
  id: 'chest-injury', name: 'Chest Injury Claim', claimType: 'workplace_injury', maxDurationSeconds: 180,
  defaultVoiceId: 'voice_default', elAgentId: null,
  personas: [{ id: 'p1', name: 'Marcus', voiceId: 'voice_marcus' }],
  documents: [
    { id: 'd1', name: 'cert.pdf', elDocumentId: 'kb_1', indexStatus: 'ready' },
    { id: 'd2', name: 'pending.pdf', elDocumentId: null, indexStatus: 'pending' },
  ],
};
const opts = { llm: 'gemini-2.5-flash', ttsModel: 'eleven_flash_v2', ragModel: 'e5_mistral_7b_instruct' };

describe('buildAgentPayload', () => {
  it('builds the conversation config from the scenario', () => {
    const p = buildAgentPayload(scenario, opts);
    assert.strictEqual(p.name, 'Chest Injury Claim (chest-injury)');
    const agent = p.conversation_config.agent;
    assert.strictEqual(agent.first_message, '{{opening_line}}');
    assert.strictEqual(agent.language, 'en');
    assert.strictEqual(agent.prompt.prompt, SYSTEM_PROMPT_TEMPLATE);
    assert.strictEqual(agent.prompt.llm, 'gemini-2.5-flash');
    assert.deepStrictEqual(agent.prompt.knowledge_base, [{ type: 'file', id: 'kb_1', name: 'cert.pdf', usage_mode: 'auto' }]);
    assert.deepStrictEqual(agent.prompt.rag, { enabled: true, embedding_model: 'e5_mistral_7b_instruct' });
    assert.ok(agent.prompt.built_in_tools.end_call);
    assert.ok(agent.dynamic_variables.dynamic_variable_placeholders.opening_line);
    assert.deepStrictEqual(p.conversation_config.tts, { voice_id: 'voice_default', model_id: 'eleven_flash_v2' });
    assert.strictEqual(p.conversation_config.conversation.max_duration_seconds, 180);
    assert.strictEqual(p.platform_settings.overrides.conversation_config_override.tts.voice_id, true);
  });

  it('omits rag when there are no indexed documents', () => {
    const p = buildAgentPayload({ ...scenario, documents: [] }, opts);
    assert.deepStrictEqual(p.conversation_config.agent.prompt.knowledge_base, []);
    assert.deepStrictEqual(p.conversation_config.agent.prompt.rag, { enabled: false });
  });
});

function fakeDeps({ scenarioRow, createStatus = 200, patchStatus = 200, voices = [] }) {
  const calls = [];
  const db = {
    scenario: scenarioRow,
    async getScenario() { return this.scenario; },
    async setAgentSync(id, { elAgentId, error }) { calls.push(['setAgentSync', id, elAgentId, error]); if (elAgentId) this.scenario = { ...this.scenario, elAgentId }; },
    async setDefaultVoice(id, voiceId, voiceName) { calls.push(['setDefaultVoice', id, voiceId, voiceName]); this.scenario = { ...this.scenario, defaultVoiceId: voiceId, defaultVoiceName: voiceName }; },
  };
  const { ElevenLabsError } = require('../src/elevenlabs/client');
  const client = {
    async post(path, { json }) { calls.push(['POST', path, json]); if (createStatus !== 200) throw new ElevenLabsError('x', { status: createStatus, code: 'upstream', detail: 'boom' }); return { agent_id: 'agent_new' }; },
    async patch(path, { json }) { calls.push(['PATCH', path, json]); if (patchStatus === 404) throw new ElevenLabsError('x', { status: 404, code: 'not_found' }); return { agent_id: path.split('/').pop() }; },
    async del(path) { calls.push(['DELETE', path]); },
  };
  const voicesApi = { async listVoices() { return voices; } };
  return { deps: { client, db, config: { elevenlabs: { ...opts, defaultVoiceId: null } }, voices: voicesApi }, calls };
}

describe('scenarioSync', () => {
  it('creates the agent when none exists and stores the id', async () => {
    const { deps, calls } = fakeDeps({ scenarioRow: scenario });
    const out = await syncAgent('chest-injury', deps);
    assert.deepStrictEqual(out, { ok: true, agentId: 'agent_new', error: null });
    assert.strictEqual(calls[0][0], 'POST');
    assert.strictEqual(calls[0][1], '/v1/convai/agents/create');
    assert.ok(calls.some((c) => c[0] === 'setAgentSync' && c[2] === 'agent_new' && c[3] === null));
  });

  it('patches an existing agent, and recreates it when ElevenLabs returns 404', async () => {
    const existing = { ...scenario, elAgentId: 'agent_old' };
    const ok = fakeDeps({ scenarioRow: existing });
    await syncAgent('chest-injury', ok.deps);
    assert.strictEqual(ok.calls[0][0], 'PATCH');
    assert.strictEqual(ok.calls[0][1], '/v1/convai/agents/agent_old');

    const gone = fakeDeps({ scenarioRow: existing, patchStatus: 404 });
    const out = await syncAgent('chest-injury', gone.deps);
    assert.strictEqual(out.agentId, 'agent_new');
    assert.ok(gone.calls.some((c) => c[0] === 'POST'));
  });

  it('records the error instead of throwing', async () => {
    const { deps, calls } = fakeDeps({ scenarioRow: scenario, createStatus: 500 });
    const out = await syncAgent('chest-injury', deps);
    assert.strictEqual(out.ok, false);
    assert.match(out.error, /boom/);
    assert.ok(calls.some((c) => c[0] === 'setAgentSync' && c[3] && /boom/.test(c[3])));
  });

  it('picks an Australian premade voice when the scenario has none', async () => {
    const voices = [
      { voiceId: 'v_us', name: 'Bella', category: 'premade', labels: { accent: 'american' } },
      { voiceId: 'v_au', name: 'Emma', category: 'professional', labels: { accent: 'australian' } },
    ];
    const { deps, calls } = fakeDeps({ scenarioRow: { ...scenario, defaultVoiceId: null }, voices });
    const v = await resolveDefaultVoice(deps.db.scenario, deps);
    assert.deepStrictEqual(v, { voiceId: 'v_au', voiceName: 'Emma' });
    await syncAgent('chest-injury', deps);
    assert.ok(calls.some((c) => c[0] === 'setDefaultVoice' && c[2] === 'v_au'));
    const post = calls.find((c) => c[0] === 'POST');
    assert.strictEqual(post[2].conversation_config.tts.voice_id, 'v_au');
  });

  it('ensureAgent returns the existing id without calling ElevenLabs', async () => {
    const { deps, calls } = fakeDeps({ scenarioRow: { ...scenario, elAgentId: 'agent_old' } });
    assert.strictEqual(await ensureAgent(deps.db.scenario, deps), 'agent_old');
    assert.strictEqual(calls.length, 0);
  });
});
