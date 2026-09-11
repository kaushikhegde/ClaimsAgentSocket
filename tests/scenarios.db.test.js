const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const hasDb = !!process.env.DATABASE_URL || (() => { try { require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true }); return !!process.env.DATABASE_URL; } catch { return false; } })();

describe('db/scenarios', { skip: !hasDb && 'DATABASE_URL not set' }, () => {
  let pool, db;
  const id = `test-scn-${Date.now().toString(36)}`;

  before(async () => {
    pool = require('../src/db/pool');
    db = require('../src/db/scenarios');
  });

  after(async () => {
    await pool.query('DELETE FROM scenarios WHERE id = $1', [id]);
    await pool.end();
  });

  it('creates a scenario with personas and reads it back', async () => {
    const created = await db.createScenario({
      id, name: 'Test Scenario', description: 'desc', claimType: 'workplace_injury', difficulty: 'beginner',
      maxDurationSeconds: 120, defaultVoiceId: 'v1', defaultVoiceName: 'Emma',
      personas: [
        { name: 'A', gender: 'female', backstory: 'story a', emotionalState: 'calm', openingLine: 'hi a', voiceId: null, voiceName: null },
        { name: 'B', gender: 'male', backstory: 'story b', emotionalState: 'angry', openingLine: 'hi b', voiceId: 'v2', voiceName: 'Charlie' },
      ],
    });
    assert.strictEqual(created.id, id);
    assert.strictEqual(created.personas.length, 2);
    assert.strictEqual(created.personas[0].name, 'A');
    assert.strictEqual(created.documentCount, 0);
    const fetched = await db.getScenario(id);
    assert.strictEqual(fetched.maxDurationSeconds, 120);
    assert.deepStrictEqual(fetched.documents, []);
  });

  it('updates personas by id, deleting the missing ones', async () => {
    const before = await db.getScenario(id);
    const keep = before.personas[0];
    const updated = await db.updateScenario(id, {
      name: 'Renamed', description: 'desc', claimType: 'workplace_injury', difficulty: 'advanced', maxDurationSeconds: 180,
      defaultVoiceId: 'v1', defaultVoiceName: 'Emma',
      personas: [
        { id: keep.id, name: 'A2', gender: 'female', backstory: 'story a2', emotionalState: 'calm', openingLine: 'hi a2', voiceId: null, voiceName: null },
        { name: 'C', gender: 'male', backstory: 'story c', emotionalState: 'sad', openingLine: 'hi c', voiceId: null, voiceName: null },
      ],
    });
    assert.strictEqual(updated.name, 'Renamed');
    assert.strictEqual(updated.personas.length, 2);
    assert.strictEqual(updated.personas.find((p) => p.id === keep.id).name, 'A2');
    assert.ok(!updated.personas.some((p) => p.name === 'B'));
  });

  it('documents, sync state and pending calls round-trip', async () => {
    await db.setAgentSync(id, { elAgentId: 'agent_x', error: null });
    const doc = await db.insertDocument({ scenarioId: id, name: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10, blobPath: 'claims-agent/documents/x/a.pdf', elDocumentId: 'doc_1', indexStatus: 'indexing' });
    await db.updateDocumentStatus(doc.id, 'ready');
    const s = await db.getScenario(id);
    assert.strictEqual(s.elAgentId, 'agent_x');
    assert.strictEqual(s.documents[0].indexStatus, 'ready');
    assert.strictEqual((await db.listScenarios()).find((x) => x.id === id).documentCount, 1);
    await db.deleteDocument(doc.id);

    await db.insertPendingCall({ conversationId: 'conv_test_1', scenarioId: id, personaId: s.personas[0].id, mode: 'scripted', agentName: 'Sam' });
    const taken = await db.takePendingCall('conv_test_1');
    assert.strictEqual(taken.scenarioId, id);
    assert.strictEqual(taken.agentName, 'Sam');
    assert.strictEqual(await db.takePendingCall('conv_test_1'), null);
  });

  it('public view hides backstory and inactive scenarios disappear from the list', async () => {
    const s = await db.getScenario(id);
    const pub = db.toPublicScenario(s);
    assert.strictEqual(pub.personas[0].backstory, undefined);
    assert.strictEqual(pub.personas[0].name, 'A2');
    await db.deactivateScenario(id);
    assert.ok(!(await db.listScenarios()).some((x) => x.id === id));
    assert.ok((await db.listScenarios({ includeInactive: true })).some((x) => x.id === id));
  });
});
