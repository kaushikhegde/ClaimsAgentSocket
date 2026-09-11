const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normaliseVoice, listVoices, searchLibrary, addLibraryVoice, summariseUsage, RAG_LIMIT_BYTES } = require('../src/elevenlabs/voices');

describe('voices', () => {
  it('normalises a /v2/voices item', () => {
    const v = normaliseVoice({ voice_id: 'v1', name: 'Emma', preview_url: 'https://x/e.mp3', category: 'professional', labels: { gender: 'female', age: 'middle_aged', accent: 'australian', descriptive: 'neutral', use_case: 'conversational' } });
    assert.deepStrictEqual(v, { voiceId: 'v1', name: 'Emma', previewUrl: 'https://x/e.mp3', category: 'professional', labels: { accent: 'australian', gender: 'female', age: 'middle_aged', description: 'neutral', useCase: 'conversational' } });
  });

  it('filters own voices by gender and accent', async () => {
    const client = { async get() { return { voices: [
      { voice_id: 'a', name: 'Emma', labels: { gender: 'female', accent: 'australian' } },
      { voice_id: 'b', name: 'Roger', labels: { gender: 'male', accent: 'american' } },
    ] }; } };
    const out = await listVoices(client, { gender: 'female', accent: 'australian' });
    assert.deepStrictEqual(out.map((v) => v.voiceId), ['a']);
  });

  it('searches the shared library with the right params and flags free availability', async () => {
    const calls = [];
    const client = { async get(path, opts) { calls.push([path, opts]); return { has_more: true, voices: [
      { public_owner_id: 'owner1', voice_id: 'lv1', name: 'Bree', gender: 'female', age: 'middle_aged', accent: 'australian', descriptive: 'warm', use_case: 'conversational', category: 'professional', preview_url: 'https://x/b.mp3', free_users_allowed: true, is_added_by_user: false },
    ] }; } };
    const out = await searchLibrary(client, { search: 'bree', gender: 'female', accent: 'australian', page: 1 });
    assert.strictEqual(calls[0][0], '/v1/shared-voices');
    assert.deepStrictEqual(calls[0][1].query, { page_size: 30, page: 1, search: 'bree', gender: 'female', accent: 'australian', language: 'en' });
    assert.strictEqual(out.hasMore, true);
    assert.deepStrictEqual(out.voices[0], {
      voiceId: 'lv1', name: 'Bree', previewUrl: 'https://x/b.mp3', category: 'professional',
      labels: { accent: 'australian', gender: 'female', age: 'middle_aged', description: 'warm', useCase: 'conversational' },
      publicUserId: 'owner1', freeUsersAllowed: true, isAdded: false,
    });
  });

  it('adds a library voice to the account', async () => {
    const calls = [];
    const client = { async post(path, opts) { calls.push([path, opts]); return { voice_id: 'lv1' }; } };
    const out = await addLibraryVoice(client, { publicUserId: 'owner1', voiceId: 'lv1', name: 'Bree' });
    assert.deepStrictEqual(out, { voiceId: 'lv1' });
    assert.strictEqual(calls[0][0], '/v1/voices/add/owner1/lv1');
    assert.deepStrictEqual(calls[0][1].json, { new_name: 'Bree' });
  });

  it('summarises the subscription for the UI', () => {
    const u = summariseUsage({ tier: 'free', character_count: 1200, character_limit: 10000, next_character_count_reset_unix: 1791740519, voice_slots_used: 1, voice_limit: 3 });
    assert.deepStrictEqual(u, { tier: 'free', creditsUsed: 1200, creditsLimit: 10000, resetsAt: '2026-10-11T17:41:59.000Z', voiceSlotsUsed: 1, voiceSlotsLimit: 3, ragLimitBytes: RAG_LIMIT_BYTES.free });
    assert.strictEqual(RAG_LIMIT_BYTES.free, 1024 * 1024);
  });
});
