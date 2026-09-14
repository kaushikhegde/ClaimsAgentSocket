// Structured handover note fields. Keep in sync with backend/src/training/features.js.
export const HANDOVER_FIELDS = [
  { key: 'safetyStatus', label: 'Safety status & risk', placeholder: 'Is the caller safe now? Any immediate danger or threats?' },
  { key: 'safeContact', label: 'Safe contact method / time', placeholder: 'e.g. sister’s mobile, after 9am only' },
  { key: 'eventDate', label: 'Qualifying event date', placeholder: 'When did they leave home / when did the incident occur?' },
  { key: 'dependants', label: 'Children / dependants', placeholder: 'Ages, who they are with' },
  { key: 'immediateNeeds', label: 'Immediate needs', placeholder: 'Payment, housing, medical, food…' },
  { key: 'protections', label: 'Record protections actioned / outstanding', placeholder: 'Address suppression, nominee, notifications, Medicare…' },
  { key: 'referralConsent', label: 'Referral consent', placeholder: 'Consent given for social worker contact?' },
  { key: 'summary', label: 'Summary for the social worker', placeholder: 'Anything else they need so the caller doesn’t have to repeat their story' },
];
