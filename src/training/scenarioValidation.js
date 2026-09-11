const CLAIM_TYPES = ['auto_accident', 'workplace_injury', 'slip_and_fall', 'medical_malpractice', 'property_damage', 'general_injury'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const GENDERS = ['male', 'female'];
const SCENARIO_ID_RE = /^[a-z0-9][a-z0-9-]{2,49}$/;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const fail = (field, error) => ({ ok: false, field, error });

function validatePersona(p, i) {
  if (!p || typeof p !== 'object') return fail(`personas[${i}]`, 'Persona must be an object');
  const name = str(p.name, 255);
  if (!name) return fail(`personas[${i}].name`, 'Persona name is required');
  const gender = str(p.gender, 10) || 'male';
  if (!GENDERS.includes(gender)) return fail(`personas[${i}].gender`, 'Gender must be male or female');
  const backstory = str(p.backstory, 4000);
  if (!backstory) return fail(`personas[${i}].backstory`, 'Backstory is required');
  const emotionalState = str(p.emotionalState, 255);
  if (!emotionalState) return fail(`personas[${i}].emotionalState`, 'Emotional state is required');
  const openingLine = str(p.openingLine, 500) || null;
  return {
    ok: true,
    value: {
      id: typeof p.id === 'string' && p.id ? p.id : undefined,
      name, gender, backstory, emotionalState,
      openingLine: openingLine || 'Hi… yeah, I need to file a claim. I got hurt at work.',
      voiceId: str(p.voiceId, 100) || null,
      voiceName: str(p.voiceName, 255) || null,
    },
  };
}

function validateScenarioInput(body, { isCreate }) {
  if (!body || typeof body !== 'object') return fail('body', 'Request body must be JSON');
  const value = {};
  if (isCreate) {
    const id = str(body.id, 50);
    if (!SCENARIO_ID_RE.test(id)) return fail('id', 'Id must be 3-50 chars of lowercase letters, digits and dashes');
    value.id = id;
  }
  value.name = str(body.name, 255);
  if (!value.name) return fail('name', 'Name is required');
  value.description = str(body.description, 2000);
  value.claimType = str(body.claimType, 50);
  if (!CLAIM_TYPES.includes(value.claimType)) return fail('claimType', `Claim type must be one of ${CLAIM_TYPES.join(', ')}`);
  value.difficulty = str(body.difficulty, 20);
  if (!DIFFICULTIES.includes(value.difficulty)) return fail('difficulty', `Difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  const dur = Number(body.maxDurationSeconds);
  if (!Number.isInteger(dur) || dur < 60 || dur > 900) return fail('maxDurationSeconds', 'Duration must be between 60 and 900 seconds');
  value.maxDurationSeconds = dur;
  value.defaultVoiceId = str(body.defaultVoiceId, 100) || null;
  value.defaultVoiceName = str(body.defaultVoiceName, 255) || null;

  const personas = Array.isArray(body.personas) ? body.personas : [];
  if (personas.length < 1 || personas.length > 10) return fail('personas', 'A scenario needs between 1 and 10 personas');
  value.personas = [];
  for (let i = 0; i < personas.length; i++) {
    const r = validatePersona(personas[i], i);
    if (!r.ok) return r;
    value.personas.push(r.value);
  }
  return { ok: true, value };
}

module.exports = { validateScenarioInput, CLAIM_TYPES, DIFFICULTIES, GENDERS, SCENARIO_ID_RE };
