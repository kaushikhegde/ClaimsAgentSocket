const pool = require('./pool');

async function insertSession(sessionData, client) {
  const db = client || pool;
  const result = await db.query(
    `INSERT INTO training_sessions (scenario_id, scenario_mode, agent_name, overall_score, scores, rtwasa_breakdown, sop_breakdown, sentiment, coaching, duration_seconds, audio_file_path, persona_id, el_conversation_id, rubric_breakdown, rubric_snapshot, handover_note, handover_breakdown, safety_actions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING id, created_at`,
    [
      sessionData.scenarioId,
      sessionData.scenarioMode || 'scripted',
      sessionData.agentName,
      sessionData.overallScore,
      JSON.stringify(sessionData.scores),
      JSON.stringify(sessionData.rtwasaBreakdown || {}),
      JSON.stringify(sessionData.sopBreakdown || {}),
      JSON.stringify(sessionData.sentiment),
      JSON.stringify(sessionData.coaching),
      sessionData.durationSeconds,
      sessionData.audioFilePath || null,
      sessionData.personaId || null,
      sessionData.elConversationId || null,
      sessionData.rubricBreakdown ? JSON.stringify(sessionData.rubricBreakdown) : null,
      sessionData.rubricSnapshot ? JSON.stringify(sessionData.rubricSnapshot) : null,
      sessionData.handoverNote ? JSON.stringify(sessionData.handoverNote) : null,
      sessionData.handoverBreakdown ? JSON.stringify(sessionData.handoverBreakdown) : null,
      sessionData.safetyActions ? JSON.stringify(sessionData.safetyActions) : null,
    ]
  );
  return result.rows[0];
}

// persona_name comes from the personas table (sessions before migration 005 have no persona_id → null).
const SESSION_JOIN = `
  FROM training_sessions ts
  LEFT JOIN scenarios s ON ts.scenario_id = s.id
  LEFT JOIN personas p ON ts.persona_id = p.id`;

async function getSessionById(id) {
  const result = await pool.query(
    `SELECT ts.*, s.name as scenario_name, p.name as persona_name, s.description as scenario_description ${SESSION_JOIN} WHERE ts.id = $1`,
    [id]
  );
  return result.rows[0];
}

async function getAllSessions(limit = 50, offset = 0) {
  const result = await pool.query(
    `SELECT ts.*, s.name as scenario_name, p.name as persona_name ${SESSION_JOIN} ORDER BY ts.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

async function getSessionsByScenario(scenarioId, limit = 50) {
  const result = await pool.query(
    `SELECT ts.*, s.name as scenario_name, p.name as persona_name ${SESSION_JOIN} WHERE ts.scenario_id = $1 ORDER BY ts.created_at DESC LIMIT $2`,
    [scenarioId, limit]
  );
  return result.rows;
}

async function getAgentStats(agentName) {
  const hasFilter = agentName !== undefined;
  const result = await pool.query(
    `SELECT
       COUNT(*) as total_sessions,
       ROUND(AVG(overall_score)) as avg_score,
       ROUND(AVG((scores->>'empathy')::numeric)) as avg_empathy,
       ROUND(AVG((scores->>'compliance')::numeric)) as avg_compliance,
       ROUND(AVG((scores->>'informationGathering')::numeric)) as avg_info_gathering,
       ROUND(AVG((scores->>'questionQuality')::numeric)) as avg_question_quality,
       ROUND(AVG((scores->>'toneConsistency')::numeric)) as avg_tone,
       ROUND(AVG((scores->>'talkListenRatio')::numeric)) as avg_talk_listen
     FROM training_sessions
     ${hasFilter ? 'WHERE agent_name = $1' : ''}`,
    hasFilter ? [agentName] : []
  );
  return result.rows[0];
}

async function getScoreHistory(agentName, limit = 20) {
  const hasFilter = agentName !== undefined;
  const result = await pool.query(
    `SELECT id, overall_score, scores, created_at, scenario_id
     FROM training_sessions
     ${hasFilter ? 'WHERE agent_name = $1' : ''}
     ORDER BY created_at ASC
     LIMIT ${hasFilter ? '$2' : '$1'}`,
    hasFilter ? [agentName, limit] : [limit]
  );
  return result.rows;
}

async function getAllScenarios() {
  const result = await pool.query('SELECT * FROM scenarios ORDER BY difficulty');
  return result.rows;
}

module.exports = { insertSession, getSessionById, getAllSessions, getSessionsByScenario, getAgentStats, getScoreHistory, getAllScenarios };
