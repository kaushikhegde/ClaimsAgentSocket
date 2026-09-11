const pool = require('./pool');

function rowToScenario(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    claimType: r.claim_type,
    difficulty: r.difficulty,
    maxDurationSeconds: r.max_duration_seconds,
    defaultVoiceId: r.default_voice_id,
    defaultVoiceName: r.default_voice_name,
    elAgentId: r.el_agent_id,
    elSyncedAt: r.el_synced_at,
    elSyncError: r.el_sync_error,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    personas: [],
    documentCount: r.document_count !== undefined ? parseInt(r.document_count, 10) : 0,
  };
}

function rowToPersona(r) {
  return {
    id: r.id,
    scenarioId: r.scenario_id,
    name: r.name,
    gender: r.gender,
    backstory: r.backstory,
    emotionalState: r.emotional_state,
    openingLine: r.opening_line,
    voiceId: r.voice_id,
    voiceName: r.voice_name,
    sortOrder: r.sort_order,
  };
}

function rowToDocument(r) {
  return {
    id: r.id,
    scenarioId: r.scenario_id,
    name: r.name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    blobPath: r.blob_path,
    elDocumentId: r.el_document_id,
    indexStatus: r.index_status,
    createdAt: r.created_at,
  };
}

const SCENARIO_SELECT = `
  SELECT s.*, (SELECT COUNT(*) FROM scenario_documents d WHERE d.scenario_id = s.id) AS document_count
  FROM scenarios s`;

async function attachPersonas(scenarios, db) {
  if (scenarios.length === 0) return scenarios;
  const ids = scenarios.map((s) => s.id);
  const res = await db.query(
    'SELECT * FROM personas WHERE scenario_id = ANY($1) ORDER BY sort_order, name',
    [ids]
  );
  const byScenario = new Map(ids.map((id) => [id, []]));
  for (const row of res.rows) byScenario.get(row.scenario_id).push(rowToPersona(row));
  for (const s of scenarios) s.personas = byScenario.get(s.id);
  return scenarios;
}

async function listScenarios({ includeInactive = false } = {}, client) {
  const db = client || pool;
  const res = await db.query(
    `${SCENARIO_SELECT} ${includeInactive ? '' : 'WHERE s.is_active'} ORDER BY s.created_at, s.name`
  );
  return attachPersonas(res.rows.map(rowToScenario), db);
}

async function getScenario(id, { includeInactive = false } = {}, client) {
  const db = client || pool;
  const res = await db.query(
    `${SCENARIO_SELECT} WHERE s.id = $1 ${includeInactive ? '' : 'AND s.is_active'}`,
    [id]
  );
  if (res.rows.length === 0) return null;
  const [scenario] = await attachPersonas([rowToScenario(res.rows[0])], db);
  scenario.documents = await listDocuments(id, db);
  return scenario;
}

/** Insert/update/delete personas so that the set matches `personas` (matched by id). */
async function replacePersonas(scenarioId, personas, client) {
  const existing = await client.query('SELECT id FROM personas WHERE scenario_id = $1', [scenarioId]);
  const keepIds = new Set(personas.filter((p) => p.id).map((p) => p.id));
  const toDelete = existing.rows.map((r) => r.id).filter((id) => !keepIds.has(id));
  if (toDelete.length > 0) {
    await client.query('DELETE FROM personas WHERE id = ANY($1)', [toDelete]);
  }
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    const params = [p.name, p.gender || 'male', p.backstory, p.emotionalState, p.openingLine, p.voiceId || null, p.voiceName || null, i];
    if (p.id && existing.rows.some((r) => r.id === p.id)) {
      await client.query(
        `UPDATE personas SET name=$1, gender=$2, backstory=$3, emotional_state=$4, opening_line=$5, voice_id=$6, voice_name=$7, sort_order=$8
         WHERE id=$9 AND scenario_id=$10`,
        [...params, p.id, scenarioId]
      );
    } else {
      await client.query(
        `INSERT INTO personas (name, gender, backstory, emotional_state, opening_line, voice_id, voice_name, sort_order, scenario_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [...params, scenarioId]
      );
    }
  }
}

async function createScenario(dto) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO scenarios (id, name, description, claim_type, difficulty, max_duration_seconds, default_voice_id, default_voice_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [dto.id, dto.name, dto.description || '', dto.claimType, dto.difficulty, dto.maxDurationSeconds, dto.defaultVoiceId || null, dto.defaultVoiceName || null]
    );
    await replacePersonas(dto.id, dto.personas || [], client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getScenario(dto.id, { includeInactive: true });
}

async function updateScenario(id, dto) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `UPDATE scenarios SET name=$1, description=$2, claim_type=$3, difficulty=$4, max_duration_seconds=$5,
         default_voice_id=$6, default_voice_name=$7, updated_at=NOW()
       WHERE id=$8 RETURNING id`,
      [dto.name, dto.description || '', dto.claimType, dto.difficulty, dto.maxDurationSeconds, dto.defaultVoiceId || null, dto.defaultVoiceName || null, id]
    );
    if (res.rows.length === 0) { await client.query('ROLLBACK'); return null; }
    await replacePersonas(id, dto.personas || [], client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getScenario(id, { includeInactive: true });
}

async function deactivateScenario(id) {
  await pool.query('UPDATE scenarios SET is_active = FALSE, el_agent_id = NULL, updated_at = NOW() WHERE id = $1', [id]);
}

async function setAgentSync(id, { elAgentId, error }) {
  await pool.query(
    `UPDATE scenarios SET el_agent_id = COALESCE($2, el_agent_id), el_synced_at = CASE WHEN $3::text IS NULL THEN NOW() ELSE el_synced_at END,
       el_sync_error = $3 WHERE id = $1`,
    [id, elAgentId || null, error || null]
  );
}

async function setDefaultVoice(id, voiceId, voiceName) {
  await pool.query('UPDATE scenarios SET default_voice_id = $2, default_voice_name = $3 WHERE id = $1', [id, voiceId, voiceName || null]);
}

async function listDocuments(scenarioId, client) {
  const db = client || pool;
  const res = await db.query('SELECT * FROM scenario_documents WHERE scenario_id = $1 ORDER BY created_at', [scenarioId]);
  return res.rows.map(rowToDocument);
}

async function getDocument(docId) {
  const res = await pool.query('SELECT * FROM scenario_documents WHERE id = $1', [docId]);
  return res.rows[0] ? rowToDocument(res.rows[0]) : null;
}

async function insertDocument({ scenarioId, name, mimeType, sizeBytes, blobPath, elDocumentId, indexStatus = 'pending' }) {
  const res = await pool.query(
    `INSERT INTO scenario_documents (scenario_id, name, mime_type, size_bytes, blob_path, el_document_id, index_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [scenarioId, name, mimeType, sizeBytes, blobPath, elDocumentId || null, indexStatus]
  );
  return rowToDocument(res.rows[0]);
}

async function updateDocumentStatus(docId, indexStatus) {
  await pool.query('UPDATE scenario_documents SET index_status = $2 WHERE id = $1', [docId, indexStatus]);
}

async function deleteDocument(docId) {
  await pool.query('DELETE FROM scenario_documents WHERE id = $1', [docId]);
}

async function insertPendingCall({ conversationId, scenarioId, personaId, mode, agentName }) {
  await pool.query(
    `INSERT INTO pending_calls (conversation_id, scenario_id, persona_id, mode, agent_name) VALUES ($1,$2,$3,$4,$5)`,
    [conversationId, scenarioId, personaId || null, mode, agentName || null]
  );
}

/** Returns and removes the pending call, or null when unknown. */
async function takePendingCall(conversationId) {
  const res = await pool.query('DELETE FROM pending_calls WHERE conversation_id = $1 RETURNING *', [conversationId]);
  const r = res.rows[0];
  if (!r) return null;
  return { conversationId: r.conversation_id, scenarioId: r.scenario_id, personaId: r.persona_id, mode: r.mode, agentName: r.agent_name, startedAt: r.started_at };
}

async function purgeStalePendingCalls(maxAgeHours = 2) {
  await pool.query(`DELETE FROM pending_calls WHERE started_at < NOW() - ($1 || ' hours')::interval`, [String(maxAgeHours)]);
}

/** Trainee-facing view: no answer key (backstory/opening line), no sync internals. */
function toPublicScenario(s) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    claimType: s.claimType,
    difficulty: s.difficulty,
    maxDurationSeconds: s.maxDurationSeconds,
    documentCount: s.documentCount,
    personas: (s.personas || []).map((p) => ({ id: p.id, name: p.name, gender: p.gender, emotionalState: p.emotionalState, voiceName: p.voiceName })),
  };
}

module.exports = {
  listScenarios, getScenario, createScenario, updateScenario, deactivateScenario,
  setAgentSync, setDefaultVoice,
  listDocuments, getDocument, insertDocument, updateDocumentStatus, deleteDocument,
  insertPendingCall, takePendingCall, purgeStalePendingCalls,
  toPublicScenario,
};
