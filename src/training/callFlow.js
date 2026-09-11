// The two halves of a training call: issue a token before, and evaluate/store after.
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { buildDynamicVariables } = require('./prompts');

class CallFlowError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'CallFlowError';
    this.status = status;
    Object.assign(this, extra);
  }
}

const VALID_MODES = new Set(['scripted', 'freestyle']);

function defaultDeps() {
  return {
    db: require('../db/scenarios'),
    sync: require('./scenarioSync'),
    conversations: require('../elevenlabs/conversations'),
    evaluate: require('../evaluation/agent').evaluateSession,
    blob: require('../storage/blob'),
    pool: require('../db/pool'),
    insertSession: require('../db/sessions').insertSession,
    insertTranscript: require('../db/transcripts').insertTranscript,
    insertBatchLogs: require('../db/logs').insertBatchLogs,
    writeFallback: defaultWriteFallback,
    client: require('../elevenlabs/client').getClient(),
    config: require('../config'),
    random: Math.random,
    now: Date.now,
  };
}
function withDefaults(deps) { return { ...defaultDeps(), ...(deps || {}) }; }

function defaultWriteFallback(payload) {
  const fallbackDir = path.join(__dirname, '../../fallback');
  fs.mkdirSync(fallbackDir, { recursive: true });
  const fallbackPath = path.join(fallbackDir, `session-${Date.now()}.json`);
  fs.writeFileSync(fallbackPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  logger.warn(`Saved redacted fallback to ${fallbackPath}`);
}

function mapElevenLabsError(err) {
  if (err && err.code === 'quota') {
    return new CallFlowError(429, 'ElevenLabs credits are exhausted for this billing period', { detail: err.detail });
  }
  if (err && err.code === 'unauthorized') return new CallFlowError(502, 'ElevenLabs rejected the API key', { detail: err.detail });
  if (err && err.code === 'sync_failed') return new CallFlowError(502, `Could not prepare the ElevenLabs agent: ${err.message}`);
  if (err && err.name === 'ElevenLabsError') return new CallFlowError(502, `ElevenLabs error: ${err.detail || err.message}`);
  return err;
}

async function startCall({ scenarioId, mode, agentName }, deps) {
  const d = withDefaults(deps);
  if (!scenarioId || typeof scenarioId !== 'string') throw new CallFlowError(400, 'Missing or invalid scenarioId');
  const sessionMode = VALID_MODES.has(mode) ? mode : 'scripted';
  const trainee = (typeof agentName === 'string' && agentName.trim()) ? agentName.trim().slice(0, 255) : 'default';

  let scenario = await d.db.getScenario(scenarioId);
  if (!scenario) throw new CallFlowError(404, `Unknown scenario: ${scenarioId}`);

  d.db.purgeStalePendingCalls().catch(() => {});

  const personas = scenario.personas || [];
  const persona = sessionMode === 'scripted' && personas.length > 0
    ? personas[Math.floor(d.random() * personas.length)]
    : null;

  try {
    const agentId = await d.sync.ensureAgent(scenario, d);
    if (!scenario.defaultVoiceId) {
      // First-time sync picks a default voice; reload so the override below sees it.
      scenario = (await d.db.getScenario(scenarioId)) || scenario;
    }
    const { token, conversationId } = await d.conversations.getConversationToken(d.client, agentId);
    await d.db.insertPendingCall({ conversationId, scenarioId: scenario.id, personaId: persona ? persona.id : null, mode: sessionMode, agentName: trainee });

    return {
      conversationToken: token,
      conversationId,
      scenario: {
        id: scenario.id, name: scenario.name, claimType: scenario.claimType, difficulty: scenario.difficulty,
        maxDurationSeconds: scenario.maxDurationSeconds, documentCount: scenario.documentCount,
      },
      persona: persona ? { id: persona.id, name: persona.name, gender: persona.gender, emotionalState: persona.emotionalState } : null,
      voiceId: (persona && persona.voiceId) || scenario.defaultVoiceId || null,
      dynamicVariables: buildDynamicVariables({ mode: sessionMode, persona, claimType: scenario.claimType }),
    };
  } catch (err) {
    throw mapElevenLabsError(err);
  }
}

async function completeCall({ conversationId }, deps) {
  const d = withDefaults(deps);
  if (!conversationId || typeof conversationId !== 'string') throw new CallFlowError(400, 'Missing conversationId');

  const pending = await d.db.takePendingCall(conversationId);
  if (!pending) throw new CallFlowError(404, 'Unknown or expired conversation');

  const scenario = await d.db.getScenario(pending.scenarioId, { includeInactive: true });
  const persona = scenario && pending.personaId ? (scenario.personas || []).find((p) => p.id === pending.personaId) || null : null;

  let conversation;
  try {
    conversation = await d.conversations.waitForConversation(d.client, conversationId);
  } catch (err) {
    logger.error(`Conversation ${conversationId} could not be fetched: ${err.message}`);
    d.writeFallback({ conversationId, scenarioId: pending.scenarioId, agentName: pending.agentName, error: err.message, timestamp: new Date().toISOString() });
    return { status: 'error', message: 'Failed to retrieve the call from ElevenLabs. It has been noted for manual review.' };
  }

  const entries = d.conversations.mapTranscript(conversation.transcript);
  if (entries.length === 0) return { status: 'empty', message: 'No conversation recorded' };
  const transcript = d.conversations.transcriptToText(entries);
  const duration = (conversation.metadata && conversation.metadata.call_duration_secs) || (entries[entries.length - 1].elapsed || 0);

  try {
    const scenarioContext = {
      scenarioId: pending.scenarioId,
      scenarioName: scenario ? scenario.name : pending.scenarioId,
      claimType: scenario ? scenario.claimType : null,
      difficulty: scenario ? scenario.difficulty : null,
      personaName: persona ? persona.name : 'Unknown',
      emotionalState: persona ? persona.emotionalState : '',
      mode: pending.mode,
    };
    const evaluation = await d.evaluate(transcript, scenarioContext);

    let audioFilePath = null;
    try {
      const audio = await d.conversations.getConversationAudio(d.client, conversationId);
      if (audio && audio.length > 0) {
        audioFilePath = await d.blob.uploadAudio(`${d.now()}-${pending.scenarioId}.mp3`, audio, 'audio/mpeg');
      }
    } catch (audioErr) {
      logger.warn('Failed to save call audio:', audioErr.message);
    }

    const client = await d.pool.connect();
    let sessionId;
    try {
      await client.query('BEGIN');
      const saved = await d.insertSession({
        scenarioId: pending.scenarioId,
        scenarioMode: pending.mode,
        agentName: pending.agentName,
        overallScore: evaluation.overallScore,
        scores: evaluation.scores,
        rtwasaBreakdown: evaluation.rtwasaBreakdown,
        sopBreakdown: evaluation.sopBreakdown,
        sentiment: evaluation.sentiment,
        coaching: evaluation.coaching,
        durationSeconds: duration,
        audioFilePath,
        personaId: pending.personaId,
        elConversationId: conversationId,
      }, client);
      sessionId = saved.id;
      await d.insertTranscript(sessionId, transcript, duration, client);
      await d.insertBatchLogs(sessionId, entries, client, saved.created_at);
      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    logger.info(`Training session saved: ${sessionId}`);
    return {
      status: 'success',
      data: {
        sessionId,
        overallScore: evaluation.overallScore,
        scores: evaluation.scores,
        rtwasaBreakdown: evaluation.rtwasaBreakdown,
        sopBreakdown: evaluation.sopBreakdown,
        sentiment: evaluation.sentiment,
        coaching: evaluation.coaching,
        scenario: { id: pending.scenarioId, name: scenario ? scenario.name : pending.scenarioId },
      },
    };
  } catch (err) {
    logger.error('Failed to evaluate session:', err.message);
    try {
      const redacted = transcript
        .replace(/\b\d{10,}\b/g, '[PHONE_REDACTED]')
        .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[EMAIL_REDACTED]');
      d.writeFallback({
        redactedTranscript: redacted, entryCount: entries.length, duration, conversationId,
        scenarioId: pending.scenarioId, agentName: pending.agentName, error: err.message, timestamp: new Date().toISOString(),
      });
    } catch (fallbackErr) {
      logger.error('Fallback save also failed:', fallbackErr.message);
    }
    return { status: 'error', message: 'Failed to evaluate session. Your conversation has been saved for manual review.' };
  }
}

module.exports = { startCall, completeCall, CallFlowError };
