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
};

// Friendly label for a score key, falling back to spaced-out title case.
export function scoreLabel(key) {
  if (SCORE_LABELS[key]) return SCORE_LABELS[key];
  const spaced = key.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
