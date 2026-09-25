const { describe, it } = require('node:test');
const assert = require('node:assert');
const { startCall, draftHandover, completeCall, CallFlowError } = require('../src/training/callFlow');
const { ElevenLabsError } = require('../src/elevenlabs/client');

const scenario = {
  id: 'chest-injury', name: 'Chest Injury Claim', claimType: 'workplace_injury', difficulty: 'beginner', maxDurationSeconds: 180,
  defaultVoiceId: 'v_default', elAgentId: 'agent_1', isActive: true, documentCount: 1,
  personas: [{ id: 'p1', name: 'Marcus Johnson', gender: 'male', backstory: 'secret', emotionalState: 'distressed', openingLine: 'Hi, I hurt my chest.', voiceId: 'v_marcus' }],
  documents: [],
};

function fakeDeps({ conversation, evaluation, tokenError } = {}) {
  const calls = [];
  const pending = new Map();
  const deps = {
    db: {
      async getScenario(id) { return id === scenario.id ? scenario : null; },
      async insertPendingCall(row) { pending.set(row.conversationId, row); calls.push(['pending', row]); },
      async getPendingCall(id) { return pending.get(id) || null; },
      async takePendingCall(id) { const r = pending.get(id) || null; pending.delete(id); return r; },
      async purgeStalePendingCalls() {},
    },
    sync: { async ensureAgent(s) { return s.elAgentId; } },
    conversations: {
      async getConversationToken() { if (tokenError) throw tokenError; return { token: 'tok', conversationId: 'conv_1' }; },
      async waitForConversation() { return conversation; },
      async getConversationAudio() { return Buffer.from('mp3'); },
      mapTranscript: require('../src/elevenlabs/conversations').mapTranscript,
      transcriptToText: require('../src/elevenlabs/conversations').transcriptToText,
    },
    evaluate: async (text, ctx) => { calls.push(['evaluate', text, ctx]); return evaluation; },
    draftHandover: async (text) => { calls.push(['draft', text]); return { safetyStatus: 'Safe at sister’s house' }; },
    blob: { async uploadAudio(name, buf, ct) { calls.push(['audio', name, ct]); return `claims-agent/${name}`; } },
    pool: { async connect() { return { async query(sql) { calls.push(['sql', sql]); return { rows: [] }; }, release() {} }; } },
    insertSession: async (data) => { calls.push(['insertSession', data]); return { id: 'sess_1', created_at: new Date('2026-09-11T00:00:00Z') }; },
    insertTranscript: async (...a) => { calls.push(['insertTranscript', a[1]]); },
    insertBatchLogs: async (...a) => { calls.push(['insertLogs', a[1]]); },
    writeFallback: (payload) => { calls.push(['fallback', payload]); },
    client: {},
    config: { elevenlabs: {} },
    random: () => 0,
    now: () => 1_700_000_000_000,
  };
  return { deps, calls };
}

const evaluation = { overallScore: 77, scores: { empathy: 80 }, rtwasaBreakdown: {}, sopBreakdown: {}, sentiment: [], coaching: {} };

describe('startCall', () => {
  it('issues a token, records the pending call and hides the backstory', async () => {
    const { deps, calls } = fakeDeps();
    const out = await startCall({ scenarioId: 'chest-injury', mode: 'scripted', agentName: 'Sam' }, deps);
    assert.strictEqual(out.conversationToken, 'tok');
    assert.strictEqual(out.conversationId, 'conv_1');
    assert.strictEqual(out.voiceId, 'v_marcus');
    assert.deepStrictEqual(out.persona, { id: 'p1', name: 'Marcus Johnson', gender: 'male', emotionalState: 'distressed' });
    assert.strictEqual(out.persona.backstory, undefined); // the persona card is answer-key free; the backstory only travels inside dynamicVariables
    assert.strictEqual(out.dynamicVariables.opening_line, 'Hi, I hurt my chest.');
    assert.ok(out.dynamicVariables.character_instructions.includes('Marcus Johnson'));
    assert.deepStrictEqual(out.scenario, {
      id: 'chest-injury', name: 'Chest Injury Claim', claimType: 'workplace_injury', difficulty: 'beginner', maxDurationSeconds: 180, documentCount: 1,
      features: { handoverNote: false, safetyActions: [], contentWarning: null, scriptedOnly: false },
    });
    assert.strictEqual(out.mode, 'scripted');
    const pending = calls.find((c) => c[0] === 'pending')[1];
    assert.deepStrictEqual(pending, { conversationId: 'conv_1', scenarioId: 'chest-injury', personaId: 'p1', mode: 'scripted', agentName: 'Sam' });
  });

  it('freestyle uses the scenario default voice and no persona', async () => {
    const { deps } = fakeDeps();
    const out = await startCall({ scenarioId: 'chest-injury', mode: 'freestyle', agentName: '' }, deps);
    assert.strictEqual(out.persona, null);
    assert.strictEqual(out.voiceId, 'v_default');
    assert.ok(/invent a realistic/i.test(out.dynamicVariables.character_instructions));
  });

  it('uses a pinned persona in scripted mode, even when freestyle was asked for', async () => {
    const { deps, calls } = fakeDeps();
    const twoPersonas = { ...scenario, personas: [...scenario.personas, { id: 'p2', name: 'Sarah Mitchell', gender: 'female', backstory: 's', emotionalState: 'anxious', openingLine: 'Hello?', voiceId: null }] };
    deps.db.getScenario = async (id) => (id === scenario.id ? twoPersonas : null);
    deps.random = () => 0; // the random pick would be p1
    const out = await startCall({ scenarioId: 'chest-injury', mode: 'freestyle', agentName: 'Scenario test', personaId: 'p2' }, deps);
    assert.strictEqual(out.persona.id, 'p2');
    assert.strictEqual(out.mode, 'scripted');
    assert.strictEqual(out.voiceId, 'v_default');
    const pending = calls.find((c) => c[0] === 'pending')[1];
    assert.deepStrictEqual(pending, { conversationId: 'conv_1', scenarioId: 'chest-injury', personaId: 'p2', mode: 'scripted', agentName: 'Scenario test' });
  });

  it('rejects a persona that does not belong to the scenario', async () => {
    await assert.rejects(
      () => startCall({ scenarioId: 'chest-injury', mode: 'scripted', personaId: 'p-other' }, fakeDeps().deps),
      (e) => e instanceof CallFlowError && e.status === 400 && /Unknown persona/.test(e.message)
    );
    await assert.rejects(
      () => startCall({ scenarioId: 'chest-injury', mode: 'scripted', personaId: 42 }, fakeDeps().deps),
      (e) => e.status === 400
    );
  });

  it('404s unknown scenarios and 429s on quota', async () => {
    await assert.rejects(() => startCall({ scenarioId: 'nope', mode: 'scripted' }, fakeDeps().deps), (e) => e instanceof CallFlowError && e.status === 404);
    const quota = fakeDeps({ tokenError: new ElevenLabsError('q', { status: 402, code: 'quota', detail: 'no credits' }) });
    await assert.rejects(() => startCall({ scenarioId: 'chest-injury', mode: 'scripted' }, quota.deps), (e) => e.status === 429 && /credits/i.test(e.message));
  });
});

describe('completeCall', () => {
  const conversation = { status: 'done', transcript: [
    { role: 'agent', message: 'Hi, I hurt my chest.', time_in_call_secs: 0 },
    { role: 'user', message: 'I am sorry. What is your name?', time_in_call_secs: 3 },
  ], metadata: { call_duration_secs: 42 } };

  it('evaluates, stores audio + rows, and returns the result payload', async () => {
    const { deps, calls } = fakeDeps({ conversation, evaluation });
    await startCall({ scenarioId: 'chest-injury', mode: 'scripted', agentName: 'Sam' }, deps);
    const out = await completeCall({ conversationId: 'conv_1' }, deps);
    assert.strictEqual(out.status, 'success');
    assert.strictEqual(out.data.sessionId, 'sess_1');
    assert.strictEqual(out.data.overallScore, 77);
    assert.deepStrictEqual(out.data.scenario, { id: 'chest-injury', name: 'Chest Injury Claim' });
    const ev = calls.find((c) => c[0] === 'evaluate');
    assert.strictEqual(ev[1], 'Customer: Hi, I hurt my chest.\nAgent: I am sorry. What is your name?');
    assert.strictEqual(ev[2].personaName, 'Marcus Johnson');
    assert.strictEqual(ev[2].mode, 'scripted');
    const audio = calls.find((c) => c[0] === 'audio');
    assert.strictEqual(audio[1], '1700000000000-chest-injury.mp3');
    assert.strictEqual(audio[2], 'audio/mpeg');
    const ins = calls.find((c) => c[0] === 'insertSession')[1];
    assert.strictEqual(ins.audioFilePath, 'claims-agent/1700000000000-chest-injury.mp3');
    assert.strictEqual(ins.personaId, 'p1');
    assert.strictEqual(ins.elConversationId, 'conv_1');
    assert.strictEqual(ins.durationSeconds, 42);
    assert.ok(calls.some((c) => c[0] === 'sql' && c[1] === 'COMMIT'));
  });

  it('ignores handover and safety actions for scenarios without a rubric', async () => {
    const { deps, calls } = fakeDeps({ conversation, evaluation });
    await startCall({ scenarioId: 'chest-injury', mode: 'scripted' }, deps);
    await completeCall({ conversationId: 'conv_1', handoverNote: { summary: 'x' }, safetyActions: [{ key: 'a', at: 1 }] }, deps);
    const ctx = calls.find((c) => c[0] === 'evaluate')[2];
    assert.strictEqual(ctx.handoverEnabled, false);
    assert.strictEqual(ctx.handoverNote, null);
    assert.strictEqual(ctx.actionSequencing, null);
    const ins = calls.find((c) => c[0] === 'insertSession')[1];
    assert.strictEqual(ins.handoverNote, null);
    assert.strictEqual(ins.safetyActions, null);
  });

  it('passes the handover note and scored action timeline for rubric scenarios', async () => {
    const { deps, calls } = fakeDeps({ conversation, evaluation });
    const rubricScenario = {
      ...scenario, id: 'fdv', rubric: { title: 'T', items: [{ key: 'safety', label: 'Safety', description: 'd', critical: true }] },
      features: {
        handoverNote: true, scriptedOnly: true, contentWarning: 'warn',
        safetyActions: [{ key: 'suppress', label: 'Suppress', kind: 'protect' }, { key: 'claim', label: 'Claim', kind: 'claim' }],
      },
    };
    deps.db.getScenario = async (id) => (id === 'fdv' ? rubricScenario : null);
    const started = await startCall({ scenarioId: 'fdv', mode: 'freestyle' }, deps);
    assert.strictEqual(started.mode, 'scripted'); // scriptedOnly overrides freestyle
    await completeCall({
      conversationId: 'conv_1',
      handoverNote: { eventDate: 'Tuesday', bogus: 'dropped' },
      safetyActions: [{ key: 'claim', at: 30 }, { key: 'suppress', at: 60 }, { key: 'unknown', at: 5 }],
    }, deps);
    const ctx = calls.find((c) => c[0] === 'evaluate')[2];
    assert.strictEqual(ctx.handoverEnabled, true);
    assert.strictEqual(ctx.handoverNote.eventDate, 'Tuesday');
    assert.strictEqual(ctx.handoverNote.bogus, undefined);
    assert.strictEqual(ctx.actionSequencing.score, 50); // protection done after the claim → partial
    const ins = calls.find((c) => c[0] === 'insertSession')[1];
    assert.deepStrictEqual(ins.safetyActions.clicks, [{ key: 'claim', at: 30 }, { key: 'suppress', at: 60 }]);
  });

  it('rejects unknown conversation ids', async () => {
    await assert.rejects(() => completeCall({ conversationId: 'conv_unknown' }, fakeDeps({ conversation }).deps), (e) => e.status === 404);
  });

  it('returns empty when nothing was said', async () => {
    const { deps } = fakeDeps({ conversation: { status: 'done', transcript: [], metadata: {} }, evaluation });
    await startCall({ scenarioId: 'chest-injury', mode: 'scripted' }, deps);
    assert.deepStrictEqual(await completeCall({ conversationId: 'conv_1' }, deps), { status: 'empty', message: 'No conversation recorded' });
  });

  it('writes the fallback and returns error when evaluation fails', async () => {
    const { deps, calls } = fakeDeps({ conversation });
    deps.evaluate = async () => { throw new Error('gemini down'); };
    await startCall({ scenarioId: 'chest-injury', mode: 'scripted' }, deps);
    const out = await completeCall({ conversationId: 'conv_1' }, deps);
    assert.strictEqual(out.status, 'error');
    const fb = calls.find((c) => c[0] === 'fallback')[1];
    assert.strictEqual(fb.error, 'gemini down');
    assert.ok(fb.redactedTranscript.includes('Customer:'));
  });
});

describe('draftHandover', () => {
  const conversation = { status: 'done', transcript: [
    { role: 'agent', message: 'Centrelink, how can I help?', time_in_call_secs: 0 },
    { role: 'user', message: 'I am staying at my sister’s now.', time_in_call_secs: 4 },
  ], metadata: {} };

  function handoverDeps(features) {
    const { deps, calls } = fakeDeps({ conversation, evaluation });
    const withHandover = { ...scenario, features };
    deps.db.getScenario = async (id) => (id === scenario.id ? withHandover : null);
    return { deps, calls };
  }

  it('drafts the note from the transcript and keeps the pending call for completeCall', async () => {
    const { deps, calls } = handoverDeps({ handoverNote: true });
    await startCall({ scenarioId: 'chest-injury', mode: 'scripted' }, deps);
    const out = await draftHandover({ conversationId: 'conv_1' }, deps);
    assert.deepStrictEqual(out, { note: { safetyStatus: 'Safe at sister’s house' } });
    const draft = calls.find((c) => c[0] === 'draft');
    assert.ok(draft[1].includes('Customer: Centrelink, how can I help?'));
    assert.ok(await deps.db.getPendingCall('conv_1'));
  });

  it('rejects scenarios without a handover note', async () => {
    const { deps } = handoverDeps({ handoverNote: false });
    await startCall({ scenarioId: 'chest-injury', mode: 'scripted' }, deps);
    await assert.rejects(draftHandover({ conversationId: 'conv_1' }, deps), (e) => e instanceof CallFlowError && e.status === 400);
  });

  it('rejects unknown conversations', async () => {
    const { deps } = handoverDeps({ handoverNote: true });
    await assert.rejects(draftHandover({ conversationId: 'nope' }, deps), (e) => e instanceof CallFlowError && e.status === 404);
  });

  it('returns no note for an empty call', async () => {
    const { deps, calls } = handoverDeps({ handoverNote: true });
    deps.conversations.waitForConversation = async () => ({ status: 'done', transcript: [], metadata: {} });
    await startCall({ scenarioId: 'chest-injury', mode: 'scripted' }, deps);
    assert.deepStrictEqual(await draftHandover({ conversationId: 'conv_1' }, deps), { note: null });
    assert.ok(!calls.some((c) => c[0] === 'draft'));
  });
});
