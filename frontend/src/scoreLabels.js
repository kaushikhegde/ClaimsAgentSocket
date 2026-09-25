// Canonical human-friendly labels for evaluation score keys.
// Single source of truth shared by the session report and the training-complete screen.
export const SCORE_LABELS = {
  empathy: 'Empathy',
  compliance: 'Compliance',
  informationGathering: 'Info Gathering',
  questionQuality: 'Question Quality',
  toneConsistency: 'Tone Consistency',
  talkListenRatio: 'Talk / Listen',
  fillerWords: 'Filler Words',
  responseTime: 'Response Time',
  rtwasaCompliance: 'RTWASA Compliance',
  sopCompliance: 'SOP Compliance',
  rubricCompliance: 'Checklist Compliance',
  handoverCompleteness: 'Handover Completeness',
  actionSequencing: 'Action Sequencing',
};

// Relative weights behind the overall score, normalised over the scores a session has.
// Keep in sync with RUBRIC_WEIGHTS in backend/src/evaluation/schema.js.
export const RUBRIC_WEIGHTS = {
  rubricCompliance: 40, empathy: 20, questionQuality: 15, toneConsistency: 10,
  talkListenRatio: 5, fillerWords: 5, responseTime: 5,
  handoverCompleteness: 15, actionSequencing: 15,
};

// Fixed percentages for scenarios without a checklist.
// Keep in sync with the OVERALL SCORE line in backend/src/evaluation/prompts.js (legacy prompt).
export const LEGACY_WEIGHTS = {
  empathy: 16, compliance: 10, informationGathering: 16, questionQuality: 12, toneConsistency: 7,
  talkListenRatio: 7, fillerWords: 4, responseTime: 4, rtwasaCompliance: 12, sopCompliance: 12,
};

// Friendly label for a score key, falling back to spaced-out title case.
export function scoreLabel(key) {
  if (SCORE_LABELS[key]) return SCORE_LABELS[key];
  const spaced = key.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
