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

/** Pick a voice for scenarios that have none: env override → Australian premade → first premade. */
async function resolveDefaultVoice(scenario, deps) {
  const { config, voices, client } = withDefaults(deps);
  if (scenario.defaultVoiceId) return { voiceId: scenario.defaultVoiceId, voiceName: scenario.defaultVoiceName || null };
  if (config.elevenlabs.defaultVoiceId) return { voiceId: config.elevenlabs.defaultVoiceId, voiceName: null };
  const all = await voices.listVoices(client);
  const pick = all.find((v) => (v.labels.accent || '').includes('australian')) || all[0];
  if (!pick) throw Object.assign(new Error('No ElevenLabs voices available to use as a default'), { code: 'sync_failed' });
  return { voiceId: pick.voiceId, voiceName: pick.name };
}

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

    const payload = agents.buildAgentPayload(scenario, config.elevenlabs);
    let agentId = scenario.elAgentId;
    if (agentId) {
      try {
        await agents.updateAgent(client, agentId, payload);
      } catch (err) {
        if (err.code !== 'not_found') throw err;
        logger.warn(`ElevenLabs agent ${agentId} no longer exists — recreating`);
        agentId = null;
      }
    }
    if (!agentId) {
      agentId = await agents.createAgent(client, payload);
    }
    await db.setAgentSync(scenario.id, { elAgentId: agentId, error: null });
    logger.info(`Scenario ${scenario.id} synced to ElevenLabs agent ${agentId}`);
    return { ok: true, agentId, error: null };
  } catch (err) {
    const message = err.detail && !String(err.message).includes(err.detail) ? `${err.message}: ${err.detail}` : err.message;
    logger.error(`Scenario ${scenarioId} sync failed: ${message}`);
    try { await db.setAgentSync(scenarioId, { elAgentId: null, error: message }); } catch { /* row may be gone */ }
    return { ok: false, agentId: null, error: message };
  }
}

/** Returns the agent id, syncing first only when the scenario has none. */
async function ensureAgent(scenario, deps) {
  if (scenario.elAgentId) return scenario.elAgentId;
  const out = await syncAgent(scenario.id, deps);
  if (!out.ok) throw Object.assign(new Error(out.error || 'Agent sync failed'), { code: 'sync_failed' });
  return out.agentId;
}

module.exports = { syncAgent, ensureAgent, resolveDefaultVoice };
