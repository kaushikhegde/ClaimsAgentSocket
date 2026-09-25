const { SYSTEM_PROMPT_TEMPLATE, DYNAMIC_VARIABLE_DEFAULTS } = require('../training/prompts');

/**
 * Pure: scenario row (+documents) → ElevenLabs agent body (create and PATCH share it).
 * Only documents that already exist in the ElevenLabs knowledge base are attached.
 */
function buildAgentPayload(scenario, { llm, ttsModel, ragModel }) {
  const knowledgeBase = (scenario.documents || [])
    .filter((d) => d.elDocumentId)
    .map((d) => ({ type: 'file', id: d.elDocumentId, name: d.name, usage_mode: 'auto' }));

  return {
    name: `${scenario.name} (${scenario.id})`,
    conversation_config: {
      agent: {
        first_message: '{{opening_line}}',
        language: 'en',
        dynamic_variables: { dynamic_variable_placeholders: { ...DYNAMIC_VARIABLE_DEFAULTS } },
        prompt: {
          prompt: SYSTEM_PROMPT_TEMPLATE,
          llm,
          knowledge_base: knowledgeBase,
          rag: knowledgeBase.length > 0 ? { enabled: true, embedding_model: ragModel } : { enabled: false },
          built_in_tools: {
            end_call: { name: 'end_call', description: 'End the call once you have said goodbye and the conversation is finished.' },
          },
        },
      },
      tts: { voice_id: scenario.defaultVoiceId, model_id: ttsModel },
      conversation: { max_duration_seconds: scenario.maxDurationSeconds },
    },
    platform_settings: {
      overrides: { conversation_config_override: { tts: { voice_id: true } } },
    },
  };
}

async function createAgent(client, payload) {
  const res = await client.post('/v1/convai/agents/create', { json: payload });
  return res.agent_id;
}

async function updateAgent(client, agentId, payload) {
  await client.patch(`/v1/convai/agents/${encodeURIComponent(agentId)}`, { json: payload });
  return agentId;
}

async function deleteAgent(client, agentId) {
  try {
    await client.del(`/v1/convai/agents/${encodeURIComponent(agentId)}`);
  } catch (err) {
    if (err.code !== 'not_found') throw err;
  }
}

module.exports = { buildAgentPayload, createAgent, updateAgent, deleteAgent };
