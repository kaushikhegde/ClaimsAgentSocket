const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateRubric, keyFromLabel } = require('../src/training/scenarioValidation');
const { sanitizeRubricEvaluation, computeRubricCompliance, validateEvaluation, RUBRIC_SCORE_FIELDS } = require('../src/evaluation/schema');
const { buildEvaluationPrompt } = require('../src/evaluation/prompts');

const rubric = {
  title: 'Crisis Protocol',
  items: [
    { key: 'safetyCheck', label: 'Safety check', description: 'Asked if safe to talk', critical: true },
    { key: 'eventDate', label: 'Event date', description: 'Confirmed the date gently', critical: false },
    { key: 'referral', label: 'Referral', description: 'Offered social worker', critical: false },
  ],
};

describe('rubric validation', () => {
  it('accepts null as legacy scoring', () => {
    assert.deepStrictEqual(validateRubric(null), { ok: true, value: null });
  });

  it('derives keys from labels and defaults the title', () => {
    const r = validateRubric({ items: [{ label: 'Safe to speak?', description: 'x' }] });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.items[0].key, 'safeToSpeak');
    assert.strictEqual(r.value.items[0].critical, false);
    assert.strictEqual(r.value.title, 'Scenario Checklist');
    assert.strictEqual(keyFromLabel('1800 RESPECT offered'), 'item1800RespectOffered');
  });

  it('rejects empty, duplicate and malformed items', () => {
    assert.strictEqual(validateRubric({ items: [] }).ok, false);
    assert.strictEqual(validateRubric({ items: [{ label: 'A', description: '' }] }).ok, false);
    const dup = validateRubric({ items: [{ key: 'aa', label: 'A', description: 'x' }, { key: 'aa', label: 'B', description: 'y' }] });
    assert.strictEqual(dup.ok, false);
    assert.match(dup.error, /Duplicate/);
    assert.strictEqual(validateRubric({ items: [{ key: 'bad key', label: 'A', description: 'x' }] }).ok, false);
  });
});

describe('rubric scoring', () => {
  it('computes compliance with pass=1, partial=0.5, fail=0 and excludes na', () => {
    assert.strictEqual(computeRubricCompliance({ a: { status: 'pass' }, b: { status: 'partial' }, c: { status: 'fail' }, d: { status: 'na' } }), 50);
    assert.strictEqual(computeRubricCompliance({ a: { status: 'na' } }), 0);
  });

  it('sanitizes the model output and recomputes scores server-side', () => {
    const out = sanitizeRubricEvaluation({
      overallScore: 99, // ignored
      scores: { empathy: 80, questionQuality: 60, toneConsistency: 150, talkListenRatio: 70, fillerWords: 90, responseTime: 100, rubricCompliance: 100 },
      rubricBreakdown: {
        safetyCheck: { status: 'fail', evidence: '', reference: '' },
        eventDate: { status: 'pass', evidence: 'was that Tuesday?', reference: '1:10' },
        referral: { status: 'bogus' },
        extra: { status: 'pass' },
      },
      sentiment: [], coaching: { strengths: [], improvements: [], alternatives: [] },
    }, rubric);

    assert.deepStrictEqual(Object.keys(out.rubricBreakdown), ['safetyCheck', 'eventDate', 'referral']);
    assert.strictEqual(out.rubricBreakdown.referral.status, 'na');
    assert.strictEqual(out.scores.toneConsistency, 100);
    assert.strictEqual(out.scores.rubricCompliance, 50);
    // 50*40 + 80*20 + 60*15 + 100*10 + 70*5 + 90*5 + 100*5 = 6800 → 68
    assert.strictEqual(out.overallScore, 68);
    assert.deepStrictEqual(out.rtwasaBreakdown, {});
    assert.strictEqual(validateEvaluation(out, RUBRIC_SCORE_FIELDS).valid, true);
  });
});

describe('rubric evaluation prompt', () => {
  const ctx = { scenarioName: 'FDV', personaName: 'Jess', emotionalState: 'scared', rubric, evaluatorRole: 'trauma-informed trainer', callerContext: 'Calling Services Australia' };

  it('lists every checklist key, marks critical items and drops the insurance rubric', () => {
    const prompt = buildEvaluationPrompt('AGENT: hi', ctx);
    for (const it of rubric.items) assert.ok(prompt.includes(`"${it.key}"`));
    assert.ok(prompt.includes('safetyCheck [CRITICAL]'));
    assert.ok(prompt.includes('trauma-informed trainer'));
    assert.ok(!prompt.includes('RTWASA'));
    assert.ok(!prompt.includes('insurance'));
  });

  it('falls back to the legacy prompt without a rubric', () => {
    const prompt = buildEvaluationPrompt('AGENT: hi', { ...ctx, rubric: null });
    assert.ok(prompt.includes('RTWASA'));
  });
});
