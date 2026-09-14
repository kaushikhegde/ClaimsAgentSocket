const SCORE_FIELDS = [
  'empathy', 'compliance', 'informationGathering', 'questionQuality',
  'toneConsistency', 'talkListenRatio', 'fillerWords', 'responseTime',
  'rtwasaCompliance', 'sopCompliance'
];

const SOP_BREAKDOWN_KEYS = [
  'earlySupportiveContact', 'careBeforeInjury', 'openEndedListening',
  'healthFirstFraming', 'confidentiality', 'counsellorBoundary',
  'gradualReturnCapability', 'suitableDuties', 'keepInTouchPlan'
];

const VALID_SOP_STATUS = ['pass', 'partial', 'na'];

function sanitizeSopItem(item) {
  const raw = item || {};
  return {
    status: VALID_SOP_STATUS.includes(raw.status) ? raw.status : 'na',
    evidence: typeof raw.evidence === 'string' ? raw.evidence : '',
    reference: typeof raw.reference === 'string' ? raw.reference : '',
  };
}

function validateEvaluation(evaluation, fields = SCORE_FIELDS) {
  const errors = [];

  if (typeof evaluation.overallScore !== 'number' || evaluation.overallScore < 0 || evaluation.overallScore > 100) {
    errors.push('overallScore must be 0-100');
  }

  if (!evaluation.scores || typeof evaluation.scores !== 'object') {
    errors.push('scores object is required');
  } else {
    for (const field of fields) {
      const val = evaluation.scores[field];
      if (typeof val !== 'number' || val < 0 || val > 100) {
        errors.push(`scores.${field} must be 0-100`);
      }
    }
  }

  if (!Array.isArray(evaluation.sentiment)) {
    errors.push('sentiment must be an array');
  }

  if (!evaluation.coaching || typeof evaluation.coaching !== 'object') {
    errors.push('coaching object is required');
  } else {
    if (!Array.isArray(evaluation.coaching.strengths)) errors.push('coaching.strengths must be an array');
    if (!Array.isArray(evaluation.coaching.improvements)) errors.push('coaching.improvements must be an array');
    if (!Array.isArray(evaluation.coaching.alternatives)) errors.push('coaching.alternatives must be an array');
  }

  return { valid: errors.length === 0, errors };
}

function sanitizeEvaluation(evaluation) {
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v || 0)));

  const defaultBreakdownItem = { mentioned: false, details: '' };
  const rawBreakdown = evaluation.rtwasaBreakdown || {};

  return {
    overallScore: clamp(evaluation.overallScore),
    scores: Object.fromEntries(
      SCORE_FIELDS.map(f => [f, clamp(evaluation.scores?.[f])])
    ),
    rtwasaBreakdown: {
      incomeSupport: rawBreakdown.incomeSupport || defaultBreakdownItem,
      medicalSupport: rawBreakdown.medicalSupport || defaultBreakdownItem,
      returnToWorkServices: rawBreakdown.returnToWorkServices || defaultBreakdownItem,
      seriousInjuryClassification: rawBreakdown.seriousInjuryClassification || defaultBreakdownItem,
      lumpSumPayments: rawBreakdown.lumpSumPayments || defaultBreakdownItem,
      legalReference: rawBreakdown.legalReference || defaultBreakdownItem,
    },
    sopBreakdown: Object.fromEntries(
      SOP_BREAKDOWN_KEYS.map((k) => [k, sanitizeSopItem((evaluation.sopBreakdown || {})[k])])
    ),
    sentiment: Array.isArray(evaluation.sentiment) ? evaluation.sentiment : [],
    coaching: {
      strengths: Array.isArray(evaluation.coaching?.strengths) ? evaluation.coaching.strengths : [],
      improvements: Array.isArray(evaluation.coaching?.improvements) ? evaluation.coaching.improvements : [],
      alternatives: Array.isArray(evaluation.coaching?.alternatives) ? evaluation.coaching.alternatives : []
    }
  };
}

/* ─── Scenario rubric mode ─────────────────────────────────────── */

const RUBRIC_SCORE_FIELDS = [
  'empathy', 'questionQuality', 'toneConsistency', 'talkListenRatio',
  'fillerWords', 'responseTime', 'rubricCompliance',
];

const RUBRIC_WEIGHTS = {
  rubricCompliance: 40, empathy: 20, questionQuality: 15, toneConsistency: 10,
  talkListenRatio: 5, fillerWords: 5, responseTime: 5,
};

const VALID_RUBRIC_STATUS = ['pass', 'partial', 'fail', 'na'];

/** pass = 1, partial = 0.5, fail = 0; na items are excluded. All-na → 0. */
function computeRubricCompliance(breakdown) {
  const statuses = Object.values(breakdown).map((i) => i.status);
  const applicable = statuses.filter((s) => s !== 'na');
  if (applicable.length === 0) return 0;
  const points = applicable.reduce((n, s) => n + (s === 'pass' ? 1 : s === 'partial' ? 0.5 : 0), 0);
  return Math.round((points / applicable.length) * 100);
}

function sanitizeRubricEvaluation(evaluation, rubric) {
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const raw = (evaluation && evaluation.rubricBreakdown) || {};

  const rubricBreakdown = Object.fromEntries(rubric.items.map((it) => {
    const item = raw[it.key] || {};
    return [it.key, {
      status: VALID_RUBRIC_STATUS.includes(item.status) ? item.status : 'na',
      evidence: typeof item.evidence === 'string' ? item.evidence : '',
      reference: typeof item.reference === 'string' ? item.reference : '',
    }];
  }));

  const scores = Object.fromEntries(
    RUBRIC_SCORE_FIELDS.filter((f) => f !== 'rubricCompliance').map((f) => [f, clamp(evaluation?.scores?.[f])])
  );
  scores.rubricCompliance = computeRubricCompliance(rubricBreakdown);

  const overallScore = Math.round(
    RUBRIC_SCORE_FIELDS.reduce((sum, f) => sum + scores[f] * RUBRIC_WEIGHTS[f], 0) / 100
  );

  return {
    overallScore,
    scores,
    rubricBreakdown,
    rtwasaBreakdown: {},
    sopBreakdown: {},
    sentiment: Array.isArray(evaluation?.sentiment) ? evaluation.sentiment : [],
    coaching: {
      strengths: Array.isArray(evaluation?.coaching?.strengths) ? evaluation.coaching.strengths : [],
      improvements: Array.isArray(evaluation?.coaching?.improvements) ? evaluation.coaching.improvements : [],
      alternatives: Array.isArray(evaluation?.coaching?.alternatives) ? evaluation.coaching.alternatives : [],
    },
  };
}

module.exports = {
  SCORE_FIELDS, SOP_BREAKDOWN_KEYS, validateEvaluation, sanitizeEvaluation,
  RUBRIC_SCORE_FIELDS, RUBRIC_WEIGHTS, computeRubricCompliance, sanitizeRubricEvaluation,
};
