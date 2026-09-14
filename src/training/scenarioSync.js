// Keeps one ElevenLabs agent per scenario. Never throws to HTTP handlers — a
// failed sync is recorded on the scenario row so the builder can show it and retry.
const logger = require('../utils/logger');

function defaultDeps() {
  return {
    client: require('../elevenlabs/client').getClient(),
    db: require('../db/scenarios'),
    config: require('../config'),
    voices: require('../elevenlabs/voices'),
    agents: require('../elevenlabs/agents'),
  };
}

function withDefaults(deps) {
  const d = defaultDeps();
  return { ...d, ...(deps || {}), agents: (deps && deps.agents) || require('../elevenlabs/agents') };
}

/** Most common persona gender, or null when personas don't say. */
function dominantGender(scenario) {
  const counts = {};
  for (const p of scenario.personas || []) if (p.gender) counts[p.gender] = (counts[p.gender] || 0) + 1;
  const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return top ? top[0] : null;
}

/**
 * Pick a voice for scenarios that have none: env override → Australian voice matching the personas' gender
 * → any voice of that gender → any Australian voice → first voice. `exclude` skips voice ids known to be
 * unusable (e.g. a saved voice that doesn't exist in this ElevenLabs account).
 */
async function resolveDefaultVoice(scenario, deps, { exclude = [] } = {}) {
  const { config, voices, client } = withDefaults(deps);
  if (scenario.defaultVoiceId && !exclude.includes(scenario.defaultVoiceId)) {
    return { voiceId: scenario.defaultVoiceId, voiceName: scenario.defaultVoiceName || null };
  }
  const envVoice = config.elevenlabs.defaultVoiceId;
  if (envVoice && !exclude.includes(envVoice)) return { voiceId: envVoice, voiceName: null };
  const all = (await voices.listVoices(client)).filter((v) => !exclude.includes(v.voiceId));
  const gender = dominantGender(scenario);
  const australian = (v) => (v.labels.accent || '').includes('australian');
  const sameGender = (v) => gender && v.labels.gender === gender;
  const pick = all.find((v) => australian(v) && sameGender(v)) || all.find(sameGender) || all.find(australian) || all[0];
  if (!pick) throw Object.assign(new Error('No ElevenLabs voices available to use as a default'), { code: 'sync_failed' });
  return { voiceId: pick.voiceId, voiceName: pick.name };
}

/** ElevenLabs rejects agents whose voice isn't in the account, e.g. after switching API keys. */
const isMissingVoice = (err) => /voice/i.test(`${err.detail || ''} ${err.message || ''}`) && /not (been )?found/i.test(`${err.detail || ''} ${err.message || ''}`);

async function syncAgent(scenarioId, deps) {
  const d = withDefaults(deps);
  const { client, db, config, agents } = d;
  try {
    let scenario = await db.getScenario(scenarioId, { includeInactive: true });
    if (!scenario) return { ok: false, agentId: null, error: `Scenario ${scenarioId} not found` };

    if (!scenario.defaultVoiceId) {
      const v = await resolveDefaultVoice(scenario, d);
      await db.setDefaultVoice(scenario.id, v.voiceId, v.voiceName);
      scenario = { ...scenario, defaultVoiceId: v.voiceId, defaultVoiceName: v.voiceName };
    }

    const push = async (s) => {
      const payload = agents.buildAgentPayload(s, config.elevenlabs);
      let id = s.elAgentId;
      if (id) {
        try {
          await agents.updateAgent(client, id, payload);
        } catch (err) {
          if (err.code !== 'not_found') throw err;
          logger.warn(`ElevenLabs agent ${id} no longer exists — recreating`);
          id = null;
        }
      }
      return id || agents.createAgent(client, payload);
    };

    let agentId;
    try {
      agentId = await push(scenario);
    } catch (err) {
      if (!isMissingVoice(err)) throw err;
      // The saved default voice isn't in this account (e.g. the API key changed): pick one that is, then retry once.
      const missing = scenario.defaultVoiceId;
      const v = await resolveDefaultVoice(scenario, d, { exclude: [missing] });
      logger.warn(`Scenario ${scenario.id}: default voice ${missing} not found in ElevenLabs — switching to ${v.voiceName || v.voiceId}`);
      await db.setDefaultVoice(scenario.id, v.voiceId, v.voiceName);
      scenario = { ...scenario, defaultVoiceId: v.voiceId, defaultVoiceName: v.voiceName };
      agentId = await push(scenario);
    }
    await db.setAgentSync(scenario.id, { elAgentId: agentId, error: null });
    logger.info(`Scenario ${scenario.id} synced to ElevenLabs agent ${agentId}`);
    return { ok: true, agentId, error: null };
  } catch (err) {
    const message = err.detail && !String(err.message).includes(err.detail) ? `${err.message}: ${err.detail}` : err.message;
    logger.error(`Scenario ${scenarioId} sync failed: ${message}`);
    try { await db.setAgentSync(scenarioId, { elAgentId: null, error: message }); } catch { /* row may be gone */ }
    return { ok: false, agentId: null, error: message, code: err.code || null };
  }
}

/**
 * Returns the agent id, syncing first when the scenario has none or was synced before the current prompt.
 * Refreshing a stale agent is best-effort only when the API key lacks write permission: the existing agent
 * still exists and works on its previous prompt. Any other failure (e.g. the agent is gone and re-creating
 * it failed) is surfaced, because falling back would hand out an agent id that no longer exists.
 */
async function ensureAgent(scenario, deps) {
  const { PROMPT_UPDATED_AT } = require('./prompts');
  const stale = !scenario.elSyncedAt || new Date(scenario.elSyncedAt) < new Date(PROMPT_UPDATED_AT);
  if (scenario.elAgentId && !stale) return scenario.elAgentId;
  const out = await syncAgent(scenario.id, deps);
  if (out.ok) return out.agentId;
  if (scenario.elAgentId && out.code === 'unauthorized') {
    logger.warn(`Scenario ${scenario.id}: using existing agent ${scenario.elAgentId} with its previous prompt; refresh failed: ${out.error}`);
    return scenario.elAgentId;
  }
  throw Object.assign(new Error(out.error || 'Agent sync failed'), { code: 'sync_failed' });
}

module.exports = { syncAgent, ensureAgent, resolveDefaultVoice };
