const express = require('express');
const multer = require('multer');
const db = require('../db/scenarios');
const { syncAgent } = require('../training/scenarioSync');
const documents = require('../training/documents');
const { validateScenarioInput, SCENARIO_ID_RE } = require('../training/scenarioValidation');
const { getClient } = require('../elevenlabs/client');
const { deleteAgent } = require('../elevenlabs/agents');
const kb = require('../elevenlabs/knowledgeBase');
const logger = require('../utils/logger');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: documents.MAX_DOCUMENT_BYTES, files: 1 } });

function upstream(res, err, message) {
  logger.error(message, err.message || err);
  if (err && err.name === 'ElevenLabsError') {
    const status = err.code === 'quota' || err.code === 'rate_limited' ? 429 : 502;
    return res.status(status).json({ error: message, detail: err.detail || err.message });
  }
  return res.status(500).json({ error: message });
}

router.param('id', (req, res, next, id) => {
  if (!SCENARIO_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid scenario id' });
  next();
});

// Trainee-facing list (no backstories).
router.get('/', async (req, res) => {
  try {
    const list = await db.listScenarios();
    res.json(list.map(db.toPublicScenario));
  } catch (err) {
    upstream(res, err, 'Failed to fetch scenarios');
  }
});

// Builder view (full).
router.get('/:id', async (req, res) => {
  try {
    const s = await db.getScenario(req.params.id, { includeInactive: false });
    if (!s) return res.status(404).json({ error: 'Scenario not found' });
    res.json(s);
  } catch (err) {
    upstream(res, err, 'Failed to fetch scenario');
  }
});

router.post('/', async (req, res) => {
  const v = validateScenarioInput(req.body, { isCreate: true });
  if (!v.ok) return res.status(400).json({ error: v.error, field: v.field });
  try {
    if (await db.getScenario(v.value.id, { includeInactive: true })) {
      return res.status(409).json({ error: 'A scenario with this id already exists', field: 'id' });
    }
    await db.createScenario(v.value);
    const sync = await syncAgent(v.value.id);
    const scenario = await db.getScenario(v.value.id, { includeInactive: true });
    res.status(201).json({ ...scenario, sync });
  } catch (err) {
    upstream(res, err, 'Failed to create scenario');
  }
});

router.put('/:id', async (req, res) => {
  const v = validateScenarioInput(req.body, { isCreate: false });
  if (!v.ok) return res.status(400).json({ error: v.error, field: v.field });
  try {
    const updated = await db.updateScenario(req.params.id, v.value);
    if (!updated) return res.status(404).json({ error: 'Scenario not found' });
    const sync = await syncAgent(req.params.id);
    const scenario = await db.getScenario(req.params.id, { includeInactive: true });
    res.json({ ...scenario, sync });
  } catch (err) {
    upstream(res, err, 'Failed to update scenario');
  }
});

router.post('/:id/sync', async (req, res) => {
  try {
    const sync = await syncAgent(req.params.id);
    const scenario = await db.getScenario(req.params.id, { includeInactive: true });
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
    res.json({ ...scenario, sync });
  } catch (err) {
    upstream(res, err, 'Failed to sync scenario');
  }
});

// Soft delete: history keeps referencing the row; the ElevenLabs agent + documents go for real.
router.delete('/:id', async (req, res) => {
  try {
    const s = await db.getScenario(req.params.id, { includeInactive: true });
    if (!s) return res.status(404).json({ error: 'Scenario not found' });
    const client = getClient();
    for (const doc of s.documents || []) {
      await db.deleteDocument(doc.id);
      if (doc.elDocumentId) { try { await kb.deleteDocument(client, doc.elDocumentId); } catch (e) { logger.warn(`KB delete ${doc.elDocumentId}: ${e.message}`); } }
    }
    if (s.elAgentId) { try { await deleteAgent(client, s.elAgentId); } catch (e) { logger.warn(`Agent delete ${s.elAgentId}: ${e.message}`); } }
    await db.deactivateScenario(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    upstream(res, err, 'Failed to delete scenario');
  }
});

router.post('/:id/documents', (req, res) => {
  upload.single('file')(req, res, async (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 20 MB' : multerErr.message });
    try {
      const s = await db.getScenario(req.params.id, { includeInactive: false });
      if (!s) return res.status(404).json({ error: 'Scenario not found' });
      if (!req.file) return res.status(400).json({ error: 'Missing file field "file"' });
      const v = documents.validateUpload({ originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, existingCount: s.documents.length });
      if (!v.ok) return res.status(400).json({ error: v.error });
      const doc = await documents.addDocument(s.id, req.file);
      res.status(201).json(doc);
    } catch (err) {
      upstream(res, err, 'Failed to upload document');
    }
  });
});

router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const removed = await documents.removeDocument(req.params.id, req.params.docId);
    if (!removed) return res.status(404).json({ error: 'Document not found' });
    res.json({ ok: true });
  } catch (err) {
    upstream(res, err, 'Failed to delete document');
  }
});

module.exports = router;
