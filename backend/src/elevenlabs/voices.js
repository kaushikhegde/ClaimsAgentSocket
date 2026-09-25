function normaliseVoice(v) {
  const labels = v.labels || {};
  return {
    voiceId: v.voice_id,
    name: v.name,
    previewUrl: v.preview_url || null,
    category: v.category,
    labels: {
      accent: labels.accent || null,
      gender: labels.gender || null,
      age: labels.age || null,
      description: labels.descriptive || labels.description || null,
      useCase: labels.use_case || null,
    },
  };
}

/** Voices available to this account (premade + added). Filters are applied on labels client-side. */
async function listVoices(client, { search, gender, accent } = {}) {
  const res = await client.get('/v2/voices', { query: { page_size: 100, search: search || undefined } });
  const s = (search || '').toLowerCase();
  return (res.voices || []).map(normaliseVoice).filter((v) =>
    (!gender || v.labels.gender === gender) &&
    (!accent || (v.labels.accent || '').includes(accent)) &&
    (!s || v.name.toLowerCase().includes(s) || (v.labels.description || '').toLowerCase().includes(s))
  );
}


const MB = 1024 * 1024;
/** Max original document size indexable for RAG, per ElevenLabs subscription tier. */
const RAG_LIMIT_BYTES = { free: 1 * MB, starter: 2 * MB, creator: 20 * MB, pro: 100 * MB, scale: 500 * MB, business: 1024 * MB };

function normaliseLibraryVoice(v) {
  return {
    ...normaliseVoice({ voice_id: v.voice_id, name: v.name, preview_url: v.preview_url, category: v.category,
      labels: { gender: v.gender, age: v.age, accent: v.accent, descriptive: v.descriptive, use_case: v.use_case } }),
    publicUserId: v.public_owner_id,
    freeUsersAllowed: !!v.free_users_allowed,
    isAdded: !!v.is_added_by_user,
  };
}

/** Public Voice Library (English). `free_users_allowed` tells whether a Free account may add the voice. */
async function searchLibrary(client, { search, gender, accent, page = 0, pageSize = 30 } = {}) {
  const res = await client.get('/v1/shared-voices', {
    query: { page_size: pageSize, page, search: search || undefined, gender: gender || undefined, accent: accent || undefined, language: 'en' },
  });
  return { voices: (res.voices || []).map(normaliseLibraryVoice), hasMore: !!res.has_more };
}

async function addLibraryVoice(client, { publicUserId, voiceId, name }) {
  const res = await client.post(`/v1/voices/add/${encodeURIComponent(publicUserId)}/${encodeURIComponent(voiceId)}`, { json: { new_name: name } });
  return { voiceId: res.voice_id || voiceId };
}

async function getSubscription(client) {
  return client.get('/v1/user/subscription');
}

function summariseUsage(sub) {
  const tier = (sub.tier || 'free').toLowerCase();
  return {
    tier,
    creditsUsed: sub.character_count || 0,
    creditsLimit: sub.character_limit || 0,
    resetsAt: sub.next_character_count_reset_unix ? new Date(sub.next_character_count_reset_unix * 1000).toISOString() : null,
    voiceSlotsUsed: sub.voice_slots_used || 0,
    voiceSlotsLimit: sub.voice_limit || 0,
    ragLimitBytes: RAG_LIMIT_BYTES[tier] || RAG_LIMIT_BYTES.free,
  };
}

module.exports = { normaliseVoice, listVoices, searchLibrary, addLibraryVoice, getSubscription, summariseUsage, RAG_LIMIT_BYTES };
