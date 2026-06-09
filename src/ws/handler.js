const { TrainingSession } = require('../training/session');
const { evaluateSession } = require('../evaluation/agent');
const { getScenario } = require('../training/scenarios');
const { insertSession } = require('../db/sessions');
const { insertTranscript } = require('../db/transcripts');
const { insertBatchLogs } = require('../db/logs');
const logger = require('../utils/logger');
const blobStorage = require('../storage/blob');
const fs = require('fs');
const path = require('path');

const VALID_TYPES = new Set(['start_session', 'audio', 'user_transcript', 'end_session']);
const MAX_AUDIO_BASE64_LENGTH = 200000; // ~150KB decoded
const AUDIO_DIR = path.join(__dirname, '../../audio');

// Ensure audio directory exists
fs.mkdirSync(AUDIO_DIR, { recursive: true });

/**
 * Resample 16kHz PCM to 24kHz using linear interpolation.
 */
function resample16to24(input16) {
  const inputSamples = input16.length / 2;
  const ratio = 24000 / 16000;
  const outputSamples = Math.floor(inputSamples * ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i / ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    const s0 = srcIdx < inputSamples ? input16.readInt16LE(srcIdx * 2) : 0;
    const s1 = (srcIdx + 1) < inputSamples ? input16.readInt16LE((srcIdx + 1) * 2) : s0;
    const sample = Math.round(s0 + frac * (s1 - s0));
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return output;
}

/**
 * Build a sequential WAV buffer from the audio timeline.
 * Each chunk is laid out in conversation order (not overlapping).
 * Agent audio (16kHz) is resampled to 24kHz and gain-boosted to match customer level.
 * Returns a WAV Buffer, or null when there is no audio.
 */
function buildWavBuffer(timeline) {
  if (!timeline || timeline.length === 0) return null;

  // Group consecutive chunks by role into segments
  const segments = [];
  let currentRole = null;
  let currentChunks = [];

  for (const entry of timeline) {
    if (entry.role !== currentRole) {
      if (currentChunks.length > 0) {
        segments.push({ role: currentRole, chunks: currentChunks });
      }
      currentRole = entry.role;
      currentChunks = [entry.data];
    } else {
      currentChunks.push(entry.data);
    }
  }
  if (currentChunks.length > 0) {
    segments.push({ role: currentRole, chunks: currentChunks });
  }

  // Convert each segment to 24kHz PCM
  const pcmSegments = segments.map(seg => {
    const raw = Buffer.concat(seg.chunks.map(c => Buffer.from(c, 'base64')));
    if (seg.role === 'agent') {
      return { role: 'agent', pcm: resample16to24(raw) };
    }
    return { role: 'customer', pcm: raw };
  });

  // Calculate RMS for normalization
  function rms(buf) {
    let sum = 0;
    const samples = buf.length / 2;
    if (samples === 0) return 0;
    for (let i = 0; i < samples; i++) {
      const s = buf.readInt16LE(i * 2);
      sum += s * s;
    }
    return Math.sqrt(sum / samples);
  }

  // Get average RMS for each role
  let custTotal = 0, custCount = 0, agentTotal = 0, agentCount = 0;
  for (const seg of pcmSegments) {
    const r = rms(seg.pcm);
    if (seg.role === 'customer') { custTotal += r; custCount++; }
    else { agentTotal += r; agentCount++; }
  }
  const custRms = custCount > 0 ? custTotal / custCount : 0;
  const agentRms = agentCount > 0 ? agentTotal / agentCount : 0;

  let agentGain = 1.0;
  if (agentRms > 0 && custRms > 0) {
    agentGain = Math.min(custRms / agentRms, 6.0);
  }
  logger.info(`Audio — ${segments.length} segments, customerRMS: ${custRms.toFixed(0)}, agentRMS: ${agentRms.toFixed(0)}, agentGain: ${agentGain.toFixed(2)}`);

  // Apply gain to agent segments and concatenate sequentially
  const outputBuffers = pcmSegments.map(seg => {
    if (seg.role === 'agent' && agentGain !== 1.0) {
      const boosted = Buffer.alloc(seg.pcm.length);
      for (let i = 0; i < seg.pcm.length / 2; i++) {
        const sample = Math.round(seg.pcm.readInt16LE(i * 2) * agentGain);
        boosted.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
      }
      return boosted;
    }
    return seg.pcm;
  });

  const pcmData = Buffer.concat(outputBuffers);

  // Write WAV
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  header.write('RIFF', 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Persist the WAV: upload to Azure Blob under claims-agent/ when configured,
 * otherwise write to local disk (dev fallback). Returns the stored reference to
 * save in the DB ("claims-agent/<name>.wav" or "audio/<name>.wav"), or null.
 */
async function saveAudio(timeline, name) {
  const wavBuffer = buildWavBuffer(timeline);
  if (!wavBuffer) return null;

  const fileName = `${name}.wav`;
  if (blobStorage.isConfigured()) {
    const blobName = await blobStorage.uploadAudio(fileName, wavBuffer);
    logger.info(`Audio uploaded to blob: ${blobName}`);
    return blobName;
  }

  const filePath = path.join(AUDIO_DIR, fileName);
  fs.writeFileSync(filePath, wavBuffer, { mode: 0o600 });
  logger.info(`Audio saved locally: audio/${fileName}`);
  return `audio/${fileName}`;
}

async function handleConnection(ws) {
  logger.info('Browser client connected');
  let session = null;
  let starting = false; // I1: Guard against race condition
  let sessionMeta = null; // Track scenario + agent info for evaluation

  ws.on('message', async (rawData) => {
    try {
      // I7: Validate message structure
      let msg;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        logger.warn('Received non-JSON WebSocket message');
        return;
      }

      if (!msg.type || !VALID_TYPES.has(msg.type)) {
        logger.warn('Unknown or missing message type:', msg.type);
        return;
      }

      switch (msg.type) {
        case 'start_session': {
          if (session || starting) break; // Ignore duplicate starts
          starting = true;

          const { scenarioId, mode, agentName } = msg;

          // Validate scenarioId
          if (!scenarioId || typeof scenarioId !== 'string') {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing or invalid scenarioId' }));
            starting = false;
            break;
          }

          const scenario = getScenario(scenarioId);
          if (!scenario) {
            ws.send(JSON.stringify({ type: 'error', message: `Unknown scenario: ${scenarioId}` }));
            starting = false;
            break;
          }

          const validModes = ['scripted', 'freestyle'];
          const sessionMode = validModes.includes(mode) ? mode : 'scripted';

          // Pick a random persona from the scenario's pool
          const personas = scenario.personas || [];
          const persona = personas.length > 0
            ? personas[Math.floor(Math.random() * personas.length)]
            : { name: 'Unknown', gender: 'male', backstory: '', emotionalState: '' };

          // Merge persona into scenario for prompt compatibility
          const scenarioWithPersona = {
            ...scenario,
            personaName: persona.name,
            personaBackstory: persona.backstory,
            emotionalState: persona.emotionalState,
          };

          sessionMeta = {
            scenarioId,
            mode: sessionMode,
            agentName: (typeof agentName === 'string' && agentName.trim()) ? agentName.trim() : 'default',
            scenario: scenarioWithPersona,
            persona,
          };

          // Notify browser of the selected persona
          ws.send(JSON.stringify({ type: 'persona_selected', persona }));

          try {
            session = new TrainingSession(ws, scenarioWithPersona, sessionMode);
            await session.start();
            session.sendInitialGreeting();
          } catch (err) {
            logger.error('Failed to start session:', err.message);
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to connect to AI service' }));
            session = null;
            sessionMeta = null;
          }
          starting = false;
          break;
        }

        case 'audio':
          if (!session) break;
          // I7: Validate audio data exists and isn't too large
          if (typeof msg.data !== 'string' || msg.data.length > MAX_AUDIO_BASE64_LENGTH) break;
          session.sendAudio(msg.data);
          break;

        case 'user_transcript':
          if (!session) break;
          if (typeof msg.text !== 'string' || msg.text.length > 5000) break;
          break;

        case 'end_session':
          if (session) {
            await endSession(session, ws, sessionMeta);
            session = null;
            sessionMeta = null;
          }
          break;
      }
    } catch (err) {
      logger.error('Error handling browser message:', err.message);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
      }
    }
  });

  ws.on('close', async () => {
    logger.info('Browser client disconnected');
    if (session) {
      // Try to evaluate if we have transcript data
      if (sessionMeta && session.getTranscriptEntries().length > 0) {
        try {
          await endSession(session, ws, sessionMeta);
        } catch {
          session.end();
        }
      } else {
        session.end();
      }
      session = null;
      sessionMeta = null;
    }
  });
}

async function endSession(session, ws, meta) {
  // I3: Read transcript BEFORE ending session
  const transcript = session.getTranscript();
  const entries = session.getTranscriptEntries();
  const duration = session.getDurationSeconds();
  const audioTimeline = session.getAudioTimeline();

  session.end();

  if (!transcript || entries.length === 0) {
    ws.send(JSON.stringify({ type: 'result', status: 'empty', message: 'No conversation recorded' }));
    return;
  }

  ws.send(JSON.stringify({ type: 'processing', message: 'Evaluating your session...' }));

  try {
    // Build scenario context for evaluation
    const scenarioContext = {
      scenarioId: meta.scenarioId,
      scenarioName: meta.scenario.name,
      claimType: meta.scenario.claimType,
      difficulty: meta.scenario.difficulty,
      personaName: meta.scenario.personaName,
      emotionalState: meta.scenario.emotionalState,
      mode: meta.mode,
    };

    const evaluation = await evaluateSession(transcript, scenarioContext);

    // Persist audio (Azure Blob, or local disk in dev) before opening the DB
    // transaction so a slow upload doesn't hold a pooled connection open.
    let audioFilePath = null;
    try {
      logger.info(`Audio timeline: ${audioTimeline.length} chunks`);
      audioFilePath = await saveAudio(audioTimeline, `${Date.now()}-${meta.scenarioId}`);
    } catch (audioErr) {
      logger.warn('Failed to save audio:', audioErr.message);
    }

    // Save to DB using transaction for multi-table insert
    const pool = require('../db/pool');
    const client = await pool.connect();
    let sessionId;
    try {
      await client.query('BEGIN');

      const sessionData = {
        scenarioId: meta.scenarioId,
        scenarioMode: meta.mode,
        agentName: meta.agentName,
        overallScore: evaluation.overallScore,
        scores: evaluation.scores,
        rtwasaBreakdown: evaluation.rtwasaBreakdown,
        sentiment: evaluation.sentiment,
        coaching: evaluation.coaching,
        durationSeconds: duration,
        audioFilePath,
      };

      const savedSession = await insertSession(sessionData, client);
      sessionId = savedSession.id;
      await insertTranscript(sessionId, transcript, duration, client);
      await insertBatchLogs(sessionId, entries, client, savedSession.created_at);
      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    logger.info(`Training session saved: ${sessionId}`);

    ws.send(JSON.stringify({
      type: 'result',
      status: 'success',
      data: {
        sessionId,
        overallScore: evaluation.overallScore,
        scores: evaluation.scores,
        rtwasaBreakdown: evaluation.rtwasaBreakdown,
        sentiment: evaluation.sentiment,
        coaching: evaluation.coaching,
        scenario: {
          id: meta.scenarioId,
          name: meta.scenario.name,
        },
      },
    }));
  } catch (err) {
    logger.error('Failed to evaluate session:', err.message);

    try {
      // Fix 17: mkdirSync with recursive is idempotent
      const fallbackDir = path.join(__dirname, '../../fallback');
      fs.mkdirSync(fallbackDir, { recursive: true });
      const fallbackPath = path.join(fallbackDir, `session-${Date.now()}.json`);
      const redacted = transcript
        .replace(/\b\d{10,}\b/g, '[PHONE_REDACTED]')
        .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[EMAIL_REDACTED]');
      // Fix 18: Restrict file permissions for PII
      fs.writeFileSync(fallbackPath, JSON.stringify({
        redactedTranscript: redacted,
        entryCount: entries.length,
        duration,
        scenarioId: meta?.scenarioId,
        agentName: meta?.agentName,
        error: err.message,
        timestamp: new Date().toISOString(),
      }, null, 2), { mode: 0o600 });
      logger.warn(`Saved redacted fallback to ${fallbackPath}`);
    } catch (fallbackErr) {
      logger.error('Fallback save also failed:', fallbackErr.message);
    }

    ws.send(JSON.stringify({
      type: 'result',
      status: 'error',
      message: 'Failed to evaluate session. Your conversation has been saved for manual review.',
    }));
  }
}

module.exports = { handleConnection };
