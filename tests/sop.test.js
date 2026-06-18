const { describe, it } = require('node:test');
const assert = require('node:assert');
const { SCORE_FIELDS, SOP_BREAKDOWN_KEYS, validateEvaluation, sanitizeEvaluation } = require('../src/evaluation/schema');

function baseRawEval() {
  return {
    overallScore: 80,
    scores: {
      empathy: 80, compliance: 80, informationGathering: 80, questionQuality: 80,
      toneConsistency: 80, talkListenRatio: 80, fillerWords: 80, responseTime: 80,
      rtwasaCompliance: 80, sopCompliance: 80,
    },
    sentiment: [],
    coaching: { strengths: [], improvements: [], alternatives: [] },
  };
}

describe('SOP schema', () => {
  it('includes sopCompliance in SCORE_FIELDS', () => {
    assert.ok(SCORE_FIELDS.includes('sopCompliance'));
  });

  it('exposes the 9 SOP breakdown keys in order', () => {
    assert.deepStrictEqual(SOP_BREAKDOWN_KEYS, [
      'earlySupportiveContact', 'careBeforeInjury', 'openEndedListening',
      'healthFirstFraming', 'confidentiality', 'counsellorBoundary',
      'gradualReturnCapability', 'suitableDuties', 'keepInTouchPlan',
    ]);
  });

  it('defaults a missing sopBreakdown to 9 na items', () => {
    const out = sanitizeEvaluation(baseRawEval());
    assert.strictEqual(Object.keys(out.sopBreakdown).length, 9);
    for (const k of SOP_BREAKDOWN_KEYS) {
      assert.deepStrictEqual(out.sopBreakdown[k], { status: 'na', evidence: '', reference: '' });
    }
  });

  it('keeps valid statuses and coerces unknown status to na', () => {
    const raw = baseRawEval();
    raw.sopBreakdown = {
      earlySupportiveContact: { status: 'pass', evidence: 'Said hi at start', reference: '0:05' },
      careBeforeInjury: { status: 'partial', evidence: 'mostly', reference: '0:20' },
      openEndedListening: { status: 'bogus', evidence: 'x', reference: '1:00' },
    };
    const out = sanitizeEvaluation(raw);
    assert.deepStrictEqual(out.sopBreakdown.earlySupportiveContact, { status: 'pass', evidence: 'Said hi at start', reference: '0:05' });
    assert.strictEqual(out.sopBreakdown.careBeforeInjury.status, 'partial');
    assert.strictEqual(out.sopBreakdown.openEndedListening.status, 'na');
    assert.strictEqual(out.sopBreakdown.confidentiality.status, 'na');
  });

  it('clamps sopCompliance and validates a sanitized evaluation', () => {
    const raw = baseRawEval();
    raw.scores.sopCompliance = 150;
    const out = sanitizeEvaluation(raw);
    assert.strictEqual(out.scores.sopCompliance, 100);
    const { valid } = validateEvaluation(out);
    assert.strictEqual(valid, true);
  });

  it('rejects an evaluation missing sopCompliance', () => {
    const raw = baseRawEval();
    delete raw.scores.sopCompliance;
    const { valid, errors } = validateEvaluation(raw);
    assert.strictEqual(valid, false);
    assert.ok(errors.some(e => e.includes('sopCompliance')));
  });
});

const { buildEvaluationPrompt } = require('../src/evaluation/prompts');

describe('SOP prompt', () => {
  const prompt = buildEvaluationPrompt('AGENT: hi\nCUSTOMER: hello', {
    scenarioName: 'Test', personaName: 'Sam', emotionalState: 'anxious', claimType: 'physical',
  });

  it('mentions all 9 SOP breakdown keys', () => {
    for (const k of [
      'earlySupportiveContact', 'careBeforeInjury', 'openEndedListening',
      'healthFirstFraming', 'confidentiality', 'counsellorBoundary',
      'gradualReturnCapability', 'suitableDuties', 'keepInTouchPlan',
    ]) {
      assert.ok(prompt.includes(k), `prompt missing ${k}`);
    }
  });

  it('asks for a sopCompliance score and the reweighted total', () => {
    assert.ok(prompt.includes('sopCompliance'));
    assert.ok(prompt.includes('SOP Compliance (12%)'));
    assert.ok(prompt.includes('Empathy (16%)'));
  });
});
