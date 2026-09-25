const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  validateFeatures, normalizeFeatures, sanitizeHandoverNote, sanitizeSafetyActions, scoreActionSequencing,
} = require('../src/training/features');
const { sanitizeRubricEvaluation, validateEvaluation, rubricScoreFields } = require('../src/evaluation/schema');
const { buildEvaluationPrompt } = require('../src/evaluation/prompts');

const actions = [
  { key: 'suppressAddress', label: 'Suppress address', kind: 'protect' },
  { key: 'removeNominee', label: 'Remove nominee', kind: 'protect' },
  { key: 'openClaim', label: 'Open claim', kind: 'claim' },
];

describe('feature validation', () => {
  it('defaults to everything off', () => {
    assert.deepStrictEqual(validateFeatures(undefined, { hasRubric: false }).value, normalizeFeatures(null));
  });

  it('derives action keys and defaults kind to protect', () => {
    const r = validateFeatures({ safetyActions: [{ label: 'Stop SMS & letters' }] }, { hasRubric: true });
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.value.safetyActions, [{ key: 'stopSmsLetters', label: 'Stop SMS & letters', kind: 'protect' }]);
  });

  it('requires a rubric for handover and safety actions but not for the content warning', () => {
    assert.strictEqual(validateFeatures({ handoverNote: true }, { hasRubric: false }).ok, false);
    assert.strictEqual(validateFeatures({ safetyActions: actions }, { hasRubric: false }).ok, false);
    const warn = validateFeatures({ contentWarning: ' Heads up ', scriptedOnly: true }, { hasRubric: false });
    assert.strictEqual(warn.ok, true);
    assert.strictEqual(warn.value.contentWarning, 'Heads up');
  });

  it('rejects duplicates and action lists with no protective action', () => {
    assert.strictEqual(validateFeatures({ safetyActions: [actions[0], actions[0]] }, { hasRubric: true }).ok, false);
    assert.strictEqual(validateFeatures({ safetyActions: [actions[2]] }, { hasRubric: true }).ok, false);
  });
});

describe('handover note and action timeline sanitising', () => {
  it('keeps known handover fields and returns null when blank', () => {
    assert.strictEqual(sanitizeHandoverNote({ summary: '   ' }), null);
    const note = sanitizeHandoverNote({ eventDate: ' Tuesday ', hack: 'x' });
    assert.strictEqual(note.eventDate, 'Tuesday');
    assert.strictEqual(note.hack, undefined);
    assert.strictEqual(note.summary, '');
  });

  it('drops unknown keys, clamps and sorts clicks', () => {
    const out = sanitizeSafetyActions([{ key: 'openClaim', at: 90.4 }, { key: 'nope', at: 1 }, { key: 'removeNominee', at: -5 }], actions);
    assert.deepStrictEqual(out, [{ key: 'removeNominee', at: 0 }, { key: 'openClaim', at: 90 }]);
  });
});

describe('action sequencing', () => {
  it('passes protections done before the claim, partials after, fails when missing', () => {
    const seq = scoreActionSequencing([{ key: 'suppressAddress', at: 10 }, { key: 'openClaim', at: 40 }], actions);
    assert.strictEqual(seq.claimAt, 40);
    assert.deepStrictEqual(seq.items.map((i) => i.status), ['pass', 'fail', 'done']);
    assert.strictEqual(seq.score, 50);

    const late = scoreActionSequencing([{ key: 'openClaim', at: 5 }, { key: 'suppressAddress', at: 10 }, { key: 'removeNominee', at: 20 }], actions);
    assert.strictEqual(late.score, 50);
  });

  it('counts protections as on time when no claim was opened, and returns null without protective actions', () => {
    assert.strictEqual(scoreActionSequencing([{ key: 'suppressAddress', at: 10 }, { key: 'removeNominee', at: 99 }], actions).score, 100);
    assert.strictEqual(scoreActionSequencing([], [actions[2]]), null);
  });
});

describe('rubric evaluation with features', () => {
  const rubric = { title: 'T', items: [{ key: 'safety', label: 'Safety', description: 'd', critical: true }] };
  const raw = {
    scores: { empathy: 100, questionQuality: 100, toneConsistency: 100, talkListenRatio: 100, fillerWords: 100, responseTime: 100 },
    rubricBreakdown: { safety: { status: 'pass' } },
    handover: { completeness: 40, captured: ['date'], missing: ['kids', ''], incorrect: [] },
    sentiment: [], coaching: {},
  };

  it('adds handover and sequencing scores and normalises the overall weight', () => {
    const out = sanitizeRubricEvaluation(raw, rubric, { handover: { enabled: true, submitted: true }, actionSequencing: 0 });
    assert.strictEqual(out.scores.handoverCompleteness, 40);
    assert.strictEqual(out.scores.actionSequencing, 0);
    assert.deepStrictEqual(out.handoverBreakdown.missing, ['kids']);
    // (100*100 + 40*15 + 0*15) / 130 = 81.5 → 82
    assert.strictEqual(out.overallScore, 82);
    assert.strictEqual(validateEvaluation(out, rubricScoreFields({ handover: true, sequencing: true })).valid, true);
  });

  it('scores a missing handover note as zero', () => {
    const out = sanitizeRubricEvaluation(raw, rubric, { handover: { enabled: true, submitted: false } });
    assert.strictEqual(out.scores.handoverCompleteness, 0);
    assert.deepStrictEqual(out.handoverBreakdown.missing, ['No handover note was submitted']);
    assert.strictEqual(out.scores.actionSequencing, undefined);
  });

  it('includes the note and timeline in the prompt only when present', () => {
    const base = { scenarioName: 'S', personaName: 'P', emotionalState: 'e', rubric };
    const withBoth = buildEvaluationPrompt('AGENT: hi', {
      ...base, handoverEnabled: true, handoverNote: { eventDate: 'Tuesday' },
      actionSequencing: scoreActionSequencing([{ key: 'openClaim', at: 65 }], actions),
    });
    assert.ok(withBoth.includes('HANDOVER NOTE'));
    assert.ok(withBoth.includes('Qualifying event date: Tuesday'));
    assert.ok(withBoth.includes('"handover"'));
    assert.ok(withBoth.includes('Open claim (opens the claim): 1:05'));
    const plain = buildEvaluationPrompt('AGENT: hi', base);
    assert.ok(!plain.includes('HANDOVER NOTE'));
    assert.ok(!plain.includes('SYSTEM ACTIONS TIMELINE'));
  });
});
