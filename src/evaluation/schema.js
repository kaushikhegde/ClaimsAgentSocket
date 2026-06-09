const SCORE_FIELDS = [
  'empathy', 'compliance', 'informationGathering', 'questionQuality',
  'toneConsistency', 'talkListenRatio', 'fillerWords', 'responseTime',
  'rtwasaCompliance'
];

function validateEvaluation(evaluation) {
  const errors = [];

  if (typeof evaluation.overallScore !== 'number' || evaluation.overallScore < 0 || evaluation.overallScore > 100) {
    errors.push('overallScore must be 0-100');
  }

  if (!evaluation.scores || typeof evaluation.scores !== 'object') {
    errors.push('scores object is required');
  } else {
    for (const field of SCORE_FIELDS) {
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
    sentiment: Array.isArray(evaluation.sentiment) ? evaluation.sentiment : [],
    coaching: {
      strengths: Array.isArray(evaluation.coaching?.strengths) ? evaluation.coaching.strengths : [],
      improvements: Array.isArray(evaluation.coaching?.improvements) ? evaluation.coaching.improvements : [],
      alternatives: Array.isArray(evaluation.coaching?.alternatives) ? evaluation.coaching.alternatives : []
    }
  };
}

module.exports = { SCORE_FIELDS, validateEvaluation, sanitizeEvaluation };
