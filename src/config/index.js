const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const required = ['GEMINI_API_KEY', 'DATABASE_URL', 'ELEVENLABS_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  databaseUrl: process.env.DATABASE_URL,
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiTextModel: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
  // ElevenLabs Agents: the voice/LLM runtime for training calls. The API key
  // stays server-side; browsers only ever receive per-call WebRTC tokens.
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    llm: process.env.ELEVENLABS_LLM || 'gemini-2.5-flash',
    ttsModel: process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2',
    ragModel: process.env.ELEVENLABS_RAG_MODEL || 'e5_mistral_7b_instruct',
    defaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID || null,
  },
  // Azure Blob Storage (service-principal auth). Recordings are stored under the
  // `claims-agent/` prefix inside the container. Optional — falls back to local
  // disk when unset (e.g. local dev). TENENT_ID kept for the existing .env typo.
  azureStorage: {
    storageAccount: process.env.STORAGE_NAME,
    containerName: process.env.CONTAINER_NAME,
    tenantId: process.env.TENANT_ID || process.env.TENENT_ID,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
  },
};
