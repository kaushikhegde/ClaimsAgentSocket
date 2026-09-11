const express = require('express');
const voices = require('../elevenlabs/voices');
const { getClient } = require('../elevenlabs/client');
const logger = require('../utils/logger');

const voicesRouter = express.Router();
const elevenLabsRouter = express.Router();

const USAGE_TTL_MS = 60 * 1000;
let usageCache = { at: 0, value: null };

async function getUsage() {
  if (usageCache.value && Date.now() - usageCache.at < USAGE_TTL_MS) return usageCache.value;
  const value = voices.summariseUsage(await voices.getSubscription(getClient()));
  usageCache = { at: Date.now(), value };
  return value;
}

function upstream(res, err, message) {
  logger.error(message, err.message || err);
  if (err && err.name === 'ElevenLabsError') {
    const status = err.code === 'quota' || err.code === 'rate_limited' ? 429 : 502;
    return res.status(status).json({ error: message, detail: err.detail || err.message });
  }
  return res.status(500).json({ error: message });
}

const clean = (v) => (typeof v === 'string' ? v.trim().slice(0, 100) : undefined);

voicesRouter.get('/', async (req, res) => {
  try {
    res.json(await voices.listVoices(getClient(), { search: clean(req.query.search), gender: clean(req.query.gender), accent: clean(req.query.accent) }));
  } catch (err) {
    upstream(res, err, 'Failed to list voices');
  }
});

voicesRouter.get('/library', async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const out = await voices.searchLibrary(getClient(), { search: clean(req.query.search), gender: clean(req.query.gender), accent: clean(req.query.accent), page });
    res.json(out);
  } catch (err) {
    upstream(res, err, 'Failed to search the voice library');
  }
});

voicesRouter.post('/library/add', async (req, res) => {
  const { publicUserId, voiceId, name } = req.body || {};
  if (!clean(publicUserId) || !clean(voiceId) || !clean(name)) return res.status(400).json({ error: 'publicUserId, voiceId and name are required' });
  try {
    const usage = await getUsage();
    if (usage.voiceSlotsLimit && usage.voiceSlotsUsed >= usage.voiceSlotsLimit) {
      return res.status(429).json({ error: `All ${usage.voiceSlotsLimit} voice slots on the ${usage.tier} plan are used`, usage });
    }
    const out = await voices.addLibraryVoice(getClient(), { publicUserId: clean(publicUserId), voiceId: clean(voiceId), name: clean(name) });
    usageCache = { at: 0, value: null };
    res.json({ ...out, usage: await getUsage() });
  } catch (err) {
    upstream(res, err, 'Failed to add voice');
  }
});

elevenLabsRouter.get('/usage', async (req, res) => {
  try {
    res.json(await getUsage());
  } catch (err) {
    upstream(res, err, 'Failed to fetch ElevenLabs usage');
  }
});

module.exports = { voicesRouter, elevenLabsRouter };
