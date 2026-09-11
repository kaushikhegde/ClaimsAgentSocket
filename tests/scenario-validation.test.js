const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateScenarioInput } = require('../src/training/scenarioValidation');

const good = {
  id: 'back-strain', name: ' Back Strain ', description: 'd', claimType: 'workplace_injury', difficulty: 'beginner', maxDurationSeconds: 240,
  defaultVoiceId: 'v1', defaultVoiceName: 'Emma',
  personas: [{ name: 'Ann', gender: 'female', backstory: 'b', emotionalState: 'calm', openingLine: 'hi', voiceId: '', voiceName: '' }],
};

describe('validateScenarioInput', () => {
  it('accepts and normalises a valid payload', () => {
    const out = validateScenarioInput(good, { isCreate: true });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.value.name, 'Back Strain');
    assert.strictEqual(out.value.personas[0].voiceId, null);
    assert.strictEqual(out.value.personas[0].gender, 'female');
  });
  it('rejects bad ids, enums, durations and persona counts', () => {
    assert.strictEqual(validateScenarioInput({ ...good, id: 'Bad Id' }, { isCreate: true }).field, 'id');
    assert.strictEqual(validateScenarioInput({ ...good, claimType: 'x' }, { isCreate: true }).field, 'claimType');
    assert.strictEqual(validateScenarioInput({ ...good, difficulty: 'hard' }, { isCreate: true }).field, 'difficulty');
    assert.strictEqual(validateScenarioInput({ ...good, maxDurationSeconds: 30 }, { isCreate: true }).field, 'maxDurationSeconds');
    assert.strictEqual(validateScenarioInput({ ...good, personas: [] }, { isCreate: true }).field, 'personas');
    assert.strictEqual(validateScenarioInput({ ...good, personas: [{ ...good.personas[0], name: '' }] }, { isCreate: true }).field, 'personas[0].name');
    assert.strictEqual(validateScenarioInput({ ...good, personas: [{ ...good.personas[0], gender: 'other' }] }, { isCreate: true }).field, 'personas[0].gender');
  });
  it('ignores id on update', () => {
    const out = validateScenarioInput({ ...good, id: 'ignored' }, { isCreate: false });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.value.id, undefined);
  });
});
