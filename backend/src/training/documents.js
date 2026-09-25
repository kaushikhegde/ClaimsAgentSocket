// Scenario documents: original kept in Azure Blob, a copy in the ElevenLabs
// knowledge base attached to the scenario's agent, RAG index tracked in the DB.
const crypto = require('crypto');
const path = require('path');
const logger = require('../utils/logger');

const ALLOWED_EXTENSIONS = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
};
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENTS_PER_SCENARIO = 10;
const INDEX_POLL_MS = 5000;
const INDEX_POLL_MAX = 36; // 3 minutes

function validateUpload({ originalname, mimetype, size, existingCount }) {
  const ext = path.extname(originalname || '').slice(1).toLowerCase();
  if (!ALLOWED_EXTENSIONS[ext]) {
    return { ok: false, error: `Unsupported file type ".${ext || '?'}". Allowed: ${Object.keys(ALLOWED_EXTENSIONS).map((e) => `.${e}`).join(', ')}` };
  }
  if (!size || size > MAX_DOCUMENT_BYTES) return { ok: false, error: 'File is empty or larger than 20 MB' };
  if (existingCount >= MAX_DOCUMENTS_PER_SCENARIO) return { ok: false, error: `A scenario can have at most ${MAX_DOCUMENTS_PER_SCENARIO} documents` };
  // Trust the extension over the browser-provided MIME (browsers send octet-stream for .md).
  return { ok: true, ext, mimeType: ALLOWED_EXTENSIONS[ext] };
}

function defaultDeps() {
  return {
    blob: require('../storage/blob'),
    kb: require('../elevenlabs/knowledgeBase'),
    db: require('../db/scenarios'),
    sync: require('./scenarioSync'),
    client: require('../elevenlabs/client').getClient(),
    config: require('../config'),
    uuid: () => crypto.randomUUID(),
    startPolling: (doc, deps) => { pollIndexStatus(doc, deps).catch((err) => logger.warn(`Index polling for ${doc.id} stopped: ${err.message}`)); },
  };
}

function withDefaults(deps) { return { ...defaultDeps(), ...(deps || {}) }; }

async function addDocument(scenarioId, file, deps) {
  const d = withDefaults(deps);
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  const mimeType = ALLOWED_EXTENSIONS[ext] || file.mimetype;
  const safeName = path.basename(file.originalname).slice(0, 255);

  // Backup copy in Azure Blob. Best-effort: ElevenLabs holds the working copy, so a
  // storage outage (or an expired service-principal secret) must not block uploads.
  let blobPath = `${d.blob.PREFIX || 'claims-agent'}/documents/${scenarioId}/${d.uuid()}.${ext}`;
  try {
    await d.blob.uploadBlob(blobPath, file.buffer, mimeType);
  } catch (err) {
    logger.warn(`Document backup to Azure Blob failed (${err.message.split('\n')[0].slice(0, 160)}); continuing without it`);
    blobPath = null;
  }

  const kbDoc = await d.kb.uploadFile(d.client, { buffer: file.buffer, filename: safeName, mimeType, name: safeName });

  let doc;
  try {
    doc = await d.db.insertDocument({
      scenarioId, name: safeName, mimeType, sizeBytes: file.size, blobPath, elDocumentId: kbDoc.id, indexStatus: 'indexing',
    });
  } catch (err) {
    // Don't leave an orphan in the ElevenLabs knowledge base.
    await d.kb.deleteDocument(d.client, kbDoc.id).catch(() => {});
    throw err;
  }

  const sync = await d.sync.syncAgent(scenarioId, d);
  if (!sync.ok) logger.warn(`Document ${doc.id} uploaded but agent sync failed: ${sync.error}`);

  try {
    const idx = await d.kb.computeRagIndex(d.client, kbDoc.id, d.config.elevenlabs.ragModel);
    const status = d.kb.mapIndexStatus(idx.status);
    if (status !== 'indexing') { await d.db.updateDocumentStatus(doc.id, status); doc.indexStatus = status; }
    else d.startPolling(doc, d);
  } catch (err) {
    logger.warn(`RAG indexing could not be started for ${doc.id}: ${err.message}`);
    await d.db.updateDocumentStatus(doc.id, 'failed');
    doc.indexStatus = 'failed';
  }
  return doc;
}

/** Background: re-issue the (idempotent) index call until it reaches a terminal state. */
async function pollIndexStatus(doc, deps) {
  const d = withDefaults(deps);
  for (let i = 0; i < INDEX_POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, INDEX_POLL_MS));
    const idx = await d.kb.computeRagIndex(d.client, doc.elDocumentId, d.config.elevenlabs.ragModel);
    const status = d.kb.mapIndexStatus(idx.status);
    if (status !== 'indexing') {
      await d.db.updateDocumentStatus(doc.id, status);
      logger.info(`Document ${doc.id} index status: ${status}`);
      return status;
    }
  }
  await d.db.updateDocumentStatus(doc.id, 'failed');
  return 'failed';
}

/** Returns the removed document, or null when it doesn't belong to the scenario. Blob original is kept. */
async function removeDocument(scenarioId, docId, deps) {
  const d = withDefaults(deps);
  const doc = await d.db.getDocument(docId);
  if (!doc || doc.scenarioId !== scenarioId) return null;
  await d.db.deleteDocument(docId);
  const sync = await d.sync.syncAgent(scenarioId, d); // detaches it from the agent
  if (!sync.ok) logger.warn(`Agent sync after removing ${docId} failed: ${sync.error}`);
  if (doc.elDocumentId) await d.kb.deleteDocument(d.client, doc.elDocumentId);
  return doc;
}

module.exports = {
  ALLOWED_EXTENSIONS, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_SCENARIO,
  validateUpload, addDocument, removeDocument, pollIndexStatus,
};
