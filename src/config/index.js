const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const required = ['GEMINI_API_KEY', 'DATABASE_URL'];
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
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL || 'models/gemini-2.5-flash-native-audio-latest',
  geminiTextModel: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
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
