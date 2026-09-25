async function uploadFile(client, { buffer, filename, mimeType, name }) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('name', name || filename);
  const res = await client.post('/v1/convai/knowledge-base/file', { form });
  return { id: res.id, name: res.name || name || filename };
}

async function deleteDocument(client, documentId) {
  try {
    await client.del(`/v1/convai/knowledge-base/${encodeURIComponent(documentId)}`, { query: { force: 'true' } });
  } catch (err) {
    if (err.code !== 'not_found') throw err;
  }
}

/** Idempotent: starts indexing on first call, returns current progress afterwards. */
async function computeRagIndex(client, documentId, model) {
  const res = await client.post(`/v1/convai/knowledge-base/${encodeURIComponent(documentId)}/rag-index`, { json: { model } });
  return { status: res.status, progress: res.progress_percentage || 0 };
}

const STATUS_MAP = {
  new: 'indexing', created: 'indexing', processing: 'indexing',
  succeeded: 'ready', document_too_small: 'ready',
  rag_limit_exceeded: 'too_large',
  failed: 'failed', cannot_index_folder: 'failed',
};

function mapIndexStatus(raw) {
  return STATUS_MAP[raw] || 'failed';
}

module.exports = { uploadFile, deleteDocument, computeRagIndex, mapIndexStatus };
