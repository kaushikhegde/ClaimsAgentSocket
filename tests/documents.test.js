const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateUpload, addDocument, removeDocument, MAX_DOCUMENT_BYTES } = require('../src/training/documents');

describe('validateUpload', () => {
  it('accepts allowed types under the limits', () => {
    assert.deepStrictEqual(validateUpload({ originalname: 'Cert.PDF', mimetype: 'application/pdf', size: 1000, existingCount: 0 }), { ok: true, ext: 'pdf', mimeType: 'application/pdf' });
    assert.strictEqual(validateUpload({ originalname: 'notes.md', mimetype: 'application/octet-stream', size: 10, existingCount: 9 }).ok, true);
  });
  it('rejects bad extension, oversize and too many documents', () => {
    assert.match(validateUpload({ originalname: 'x.exe', mimetype: 'application/octet-stream', size: 10, existingCount: 0 }).error, /type/i);
    assert.match(validateUpload({ originalname: 'x.pdf', mimetype: 'application/pdf', size: MAX_DOCUMENT_BYTES + 1, existingCount: 0 }).error, /20 MB/);
    assert.match(validateUpload({ originalname: 'x.pdf', mimetype: 'application/pdf', size: 10, existingCount: 10 }).error, /10 documents/);
  });
});

function fakeDeps() {
  const calls = [];
  const docs = new Map();
  const deps = {
    blob: { PREFIX: 'claims-agent', async uploadBlob(name, buffer, ct) { calls.push(['blob', name, ct, buffer.length]); return name; } },
    kb: {
      async uploadFile(client, { name }) { calls.push(['kbUpload', name]); return { id: 'kb_9', name }; },
      async deleteDocument(client, id) { calls.push(['kbDelete', id]); },
      async computeRagIndex(client, id) { calls.push(['ragIndex', id]); return { status: 'processing', progress: 0 }; },
      mapIndexStatus: require('../src/elevenlabs/knowledgeBase').mapIndexStatus,
    },
    db: {
      async insertDocument(d) { const row = { id: 'doc_1', ...d }; docs.set(row.id, row); calls.push(['insert', d.name, d.indexStatus]); return row; },
      async updateDocumentStatus(id, s) { calls.push(['status', id, s]); docs.get(id).indexStatus = s; },
      async getDocument(id) { return docs.get(id) || null; },
      async deleteDocument(id) { calls.push(['dbDelete', id]); docs.delete(id); },
    },
    sync: { async syncAgent(id) { calls.push(['sync', id]); return { ok: true, agentId: 'a', error: null }; } },
    client: {},
    config: { elevenlabs: { ragModel: 'e5_mistral_7b_instruct' } },
    uuid: () => '11111111-2222-3333-4444-555555555555',
    startPolling: () => {},
  };
  return { deps, calls, docs };
}

describe('addDocument / removeDocument', () => {
  it('stores the original, uploads to the knowledge base, attaches and starts indexing', async () => {
    const { deps, calls } = fakeDeps();
    const file = { originalname: 'cert.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') };
    const doc = await addDocument('chest-injury', file, deps);
    assert.strictEqual(doc.elDocumentId, 'kb_9');
    assert.strictEqual(doc.indexStatus, 'indexing');
    assert.deepStrictEqual(calls.map((c) => c[0]), ['blob', 'kbUpload', 'insert', 'sync', 'ragIndex']);
    assert.strictEqual(calls[0][1], 'claims-agent/documents/chest-injury/11111111-2222-3333-4444-555555555555.pdf');
  });

  it('removes: detach (sync), delete in ElevenLabs, delete row', async () => {
    const { deps, calls } = fakeDeps();
    await addDocument('chest-injury', { originalname: 'a.txt', mimetype: 'text/plain', size: 1, buffer: Buffer.from('a') }, deps);
    calls.length = 0;
    await removeDocument('chest-injury', 'doc_1', deps);
    assert.deepStrictEqual(calls.map((c) => c[0]), ['dbDelete', 'sync', 'kbDelete']);
  });

  it('continues without the blob backup when Azure fails', async () => {
    const { deps, calls } = fakeDeps();
    deps.blob.uploadBlob = async () => { throw new Error('AADSTS7000222 secret expired'); };
    const doc = await addDocument('chest-injury', { originalname: 'a.txt', mimetype: 'text/plain', size: 1, buffer: Buffer.from('a') }, deps);
    assert.strictEqual(doc.blobPath, null);
    assert.strictEqual(doc.elDocumentId, 'kb_9');
    assert.deepStrictEqual(calls.map((c) => c[0]), ['kbUpload', 'insert', 'sync', 'ragIndex']);
  });

  it('deletes the knowledge-base copy when the DB insert fails', async () => {
    const { deps, calls } = fakeDeps();
    deps.db.insertDocument = async () => { throw new Error('db down'); };
    await assert.rejects(() => addDocument('chest-injury', { originalname: 'a.txt', mimetype: 'text/plain', size: 1, buffer: Buffer.from('a') }, deps), /db down/);
    assert.ok(calls.some((c) => c[0] === 'kbDelete' && c[1] === 'kb_9'));
  });

  it('returns null when the document belongs to another scenario', async () => {
    const { deps } = fakeDeps();
    await addDocument('chest-injury', { originalname: 'a.txt', mimetype: 'text/plain', size: 1, buffer: Buffer.from('a') }, deps);
    assert.strictEqual(await removeDocument('other', 'doc_1', deps), null);
  });
});
