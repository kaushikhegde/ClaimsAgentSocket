const { describe, it } = require('node:test');
const assert = require('node:assert');
const { uploadFile, deleteDocument, computeRagIndex, mapIndexStatus } = require('../src/elevenlabs/knowledgeBase');
const { ElevenLabsError } = require('../src/elevenlabs/client');

describe('knowledgeBase', () => {
  it('uploads a file as multipart form data', async () => {
    const calls = [];
    const client = { async post(path, opts) { calls.push([path, opts]); return { id: 'kb_1', name: 'cert.pdf' }; } };
    const out = await uploadFile(client, { buffer: Buffer.from('%PDF'), filename: 'cert.pdf', mimeType: 'application/pdf', name: 'cert.pdf' });
    assert.deepStrictEqual(out, { id: 'kb_1', name: 'cert.pdf' });
    assert.strictEqual(calls[0][0], '/v1/convai/knowledge-base/file');
    const form = calls[0][1].form;
    assert.ok(form instanceof FormData);
    assert.strictEqual(form.get('name'), 'cert.pdf');
    assert.strictEqual(form.get('file').name, 'cert.pdf');
    assert.strictEqual(form.get('file').type, 'application/pdf');
  });

  it('ignores 404 on delete but rethrows other errors', async () => {
    const gone = { async del() { throw new ElevenLabsError('x', { status: 404, code: 'not_found' }); } };
    await deleteDocument(gone, 'kb_1');
    const broken = { async del() { throw new ElevenLabsError('x', { status: 500, code: 'upstream' }); } };
    await assert.rejects(() => deleteDocument(broken, 'kb_1'));
  });

  it('triggers indexing and maps statuses', async () => {
    const calls = [];
    const client = { async post(path, opts) { calls.push([path, opts]); return { status: 'processing', progress_percentage: 10 }; } };
    const out = await computeRagIndex(client, 'kb_1', 'e5_mistral_7b_instruct');
    assert.strictEqual(calls[0][0], '/v1/convai/knowledge-base/kb_1/rag-index');
    assert.deepStrictEqual(calls[0][1].json, { model: 'e5_mistral_7b_instruct' });
    assert.deepStrictEqual(out, { status: 'processing', progress: 10 });
    assert.strictEqual(mapIndexStatus('processing'), 'indexing');
    assert.strictEqual(mapIndexStatus('created'), 'indexing');
    assert.strictEqual(mapIndexStatus('succeeded'), 'ready');
    assert.strictEqual(mapIndexStatus('document_too_small'), 'ready');
    assert.strictEqual(mapIndexStatus('rag_limit_exceeded'), 'too_large');
    assert.strictEqual(mapIndexStatus('failed'), 'failed');
    assert.strictEqual(mapIndexStatus('whatever'), 'failed');
  });
});
