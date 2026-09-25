// Optional per-scenario training features: post-call handover note, in-call
// safety-actions panel, pre-call content warning and scripted-only mode.

const HANDOVER_FIELDS = [
  { key: 'safetyStatus', label: 'Safety status & risk' },
  { key: 'safeContact', label: 'Safe contact method / time' },
  { key: 'eventDate', label: 'Qualifying event date' },
  { key: 'dependants', label: 'Children / dependants' },
  { key: 'immediateNeeds', label: 'Immediate needs' },
  { key: 'protections', label: 'Record protections actioned / outstanding' },
  { key: 'referralConsent', label: 'Referral consent' },
  { key: 'summary', label: 'Summary for the social worker' },
];

const ACTION_KINDS = ['protect', 'claim'];
const ACTION_KEY_RE = /^[a-zA-Z][a-zA-Z0-9]{1,39}$/;
const MAX_ACTIONS = 12;
const MAX_ACTION_CLICKS = 50;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const fail = (field, error) => ({ ok: false, field, error });

function keyFromLabel(label) {
  const words = label.replace(/[^a-zA-Z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  return /^[a-zA-Z]/.test(key) ? key.slice(0, 40) : `action${key}`.slice(0, 40);
}

const EMPTY_FEATURES = Object.freeze({ handoverNote: false, safetyActions: [], contentWarning: null, scriptedOnly: false });

function normalizeFeatures(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  return {
    handoverNote: f.handoverNote === true,
    safetyActions: Array.isArray(f.safetyActions) ? f.safetyActions : [],
    contentWarning: typeof f.contentWarning === 'string' && f.contentWarning ? f.contentWarning : null,
    scriptedOnly: f.scriptedOnly === true,
  };
}

/** Handover and safety actions are scored alongside a checklist, so they require a rubric. */
function validateFeatures(raw, { hasRubric }) {
  if (raw === null || raw === undefined) return { ok: true, value: { ...EMPTY_FEATURES } };
  if (typeof raw !== 'object' || Array.isArray(raw)) return fail('features', 'Features must be an object');

  const actions = Array.isArray(raw.safetyActions) ? raw.safetyActions : [];
  if (actions.length > MAX_ACTIONS) return fail('features.safetyActions', `At most ${MAX_ACTIONS} safety actions`);
  const seen = new Set();
  const safetyActions = [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i] || {};
    const label = str(a.label, 80);
    if (!label) return fail(`features.safetyActions[${i}].label`, 'Action label is required');
    const key = str(a.key, 40) || keyFromLabel(label);
    if (!ACTION_KEY_RE.test(key)) return fail(`features.safetyActions[${i}].key`, 'Key must be 2-40 letters/digits starting with a letter');
    if (seen.has(key)) return fail(`features.safetyActions[${i}].key`, `Duplicate action key: ${key}`);
    seen.add(key);
    const kind = ACTION_KINDS.includes(a.kind) ? a.kind : 'protect';
    safetyActions.push({ key, label, kind });
  }

  const value = {
    handoverNote: raw.handoverNote === true,
    safetyActions,
    contentWarning: str(raw.contentWarning, 1000) || null,
    scriptedOnly: raw.scriptedOnly === true,
  };
  if ((value.handoverNote || value.safetyActions.length > 0) && !hasRubric) {
    return fail('features', 'The handover note and safety actions need a custom scoring checklist');
  }
  if (value.safetyActions.length > 0 && !value.safetyActions.some((a) => a.kind === 'protect')) {
    return fail('features.safetyActions', 'Add at least one protective action to score sequencing');
  }
  return { ok: true, value };
}

/** Keeps only known fields; returns null when nothing was written. */
function sanitizeHandoverNote(note) {
  if (!note || typeof note !== 'object') return null;
  const out = {};
  let any = false;
  for (const { key } of HANDOVER_FIELDS) {
    out[key] = str(note[key], 2000);
    if (out[key]) any = true;
  }
  return any ? out : null;
}

function sanitizeSafetyActions(clicks, configured) {
  const known = new Set((configured || []).map((a) => a.key));
  if (!Array.isArray(clicks)) return [];
  return clicks
    .filter((c) => c && known.has(c.key) && Number.isFinite(Number(c.at)))
    .slice(0, MAX_ACTION_CLICKS)
    .map((c) => ({ key: c.key, at: Math.max(0, Math.min(3600, Math.round(Number(c.at)))) }))
    .sort((a, b) => a.at - b.at);
}

/**
 * Deterministic sequencing score: each protective action done before the first
 * claim action = pass, done after it = partial, never done = fail.
 * Returns null when the scenario has no protective actions.
 */
function scoreActionSequencing(clicks, configured) {
  const actions = configured || [];
  const protect = actions.filter((a) => a.kind === 'protect');
  if (protect.length === 0) return null;
  const firstAt = new Map();
  for (const c of clicks || []) if (!firstAt.has(c.key)) firstAt.set(c.key, c.at);
  const claimTimes = actions.filter((a) => a.kind === 'claim' && firstAt.has(a.key)).map((a) => firstAt.get(a.key));
  const claimAt = claimTimes.length > 0 ? Math.min(...claimTimes) : null;

  let points = 0;
  const items = actions.map((a) => {
    const at = firstAt.has(a.key) ? firstAt.get(a.key) : null;
    if (a.kind === 'claim') return { ...a, at, status: at === null ? 'not_done' : 'done' };
    let status;
    if (at === null) status = 'fail';
    else if (claimAt === null || at <= claimAt) status = 'pass';
    else status = 'partial';
    points += status === 'pass' ? 1 : status === 'partial' ? 0.5 : 0;
    return { ...a, at, status };
  });
  return { score: Math.round((points / protect.length) * 100), claimAt, items };
}

module.exports = {
  HANDOVER_FIELDS, ACTION_KINDS, EMPTY_FEATURES,
  normalizeFeatures, validateFeatures, sanitizeHandoverNote, sanitizeSafetyActions, scoreActionSequencing,
};
