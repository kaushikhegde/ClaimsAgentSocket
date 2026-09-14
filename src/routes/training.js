const express = require('express');
const { startCall, completeCall, CallFlowError } = require('../training/callFlow');
const logger = require('../utils/logger');

const router = express.Router();

function sendError(res, err, fallback) {
  if (err instanceof CallFlowError) {
    return res.status(err.status).json({ error: err.message, detail: err.detail, resetsAt: err.resetsAt });
  }
  logger.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

router.post('/start', async (req, res) => {
  try {
    const { scenarioId, mode, agentName } = req.body || {};
    res.json(await startCall({ scenarioId, mode, agentName }));
  } catch (err) {
    sendError(res, err, 'Failed to start training call');
  }
});

router.post('/complete', async (req, res) => {
  try {
    const { conversationId, handoverNote, safetyActions } = req.body || {};
    res.json(await completeCall({ conversationId, handoverNote, safetyActions }));
  } catch (err) {
    sendError(res, err, 'Failed to complete training call');
  }
});

module.exports = router;
