// Client-side scenario checks so the builder can flag fields before saving.
// Keep in sync with backend/src/training/scenarioValidation.js and features.js.
// Error keys use the same field paths the server returns in `ApiError.data.field`.

export const INSURANCE_TYPES = ['workplace_injury', 'auto_accident', 'slip_and_fall', 'medical_malpractice', 'property_damage', 'general_injury'];
export const SCENARIO_ID_RE =/^[a-z0-9][a-z0-9-]{2,49}$/;
export const LIMITS = {
  name: 255, description: 2000, callerContext: 4000, evaluatorRole: 200,
  personaName: 255, backstory: 4000, emotionalState: 255, openingLine: 500, situationalCues: 2000,
  rubricTitle: 120, itemLabel: 80, itemDescription: 600, actionLabel: 80, contentWarning: 1000,
  personas: 10, rubricItems: 15, safetyActions: 12,
};

const blank = (v) => typeof v !== 'string' || !v.trim();

function keyFromLabel(label, prefix) {
  const words = label.replace(/[^a-zA-Z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  return /^[a-zA-Z]/.test(key) ? key.slice(0, 40) : `${prefix}${key}`.slice(0, 40);
}

/** Returns { [fieldPath]: message }; empty when the form can be saved. */
export function validateScenarioForm(form, { isNew }) {
  const errors = {};
  if (isNew && !SCENARIO_ID_RE.test(form.id || '')) errors.id = 'Use 3–50 lowercase letters, digits and dashes';
  if (blank(form.name)) errors.name = 'Name is required';
  const dur = Number(form.maxDurationSeconds);
  if (!Number.isInteger(dur) || dur < 60 || dur > 900) errors.maxDurationSeconds = 'Duration must be 1–15 minutes';

  const personas = form.personas || [];
  if (personas.length < 1 || personas.length > LIMITS.personas) errors.personas = `A scenario needs 1–${LIMITS.personas} personas`;
  // Frontend-only rule: the backend fills a blank opening line with an insurance-claim line,
  // which is wrong for other call types, so they must provide their own.
  const needsOpeningLine = !INSURANCE_TYPES.includes(form.claimType);
  personas.forEach((p, i) => {
    if (blank(p.name)) errors[`personas[${i}].name`] = 'Name is required';
    if (blank(p.emotionalState)) errors[`personas[${i}].emotionalState`] = 'Emotional state is required';
    if (blank(p.backstory)) errors[`personas[${i}].backstory`] = 'Backstory is required';
    if (needsOpeningLine && blank(p.openingLine)) errors[`personas[${i}].openingLine`] = 'Opening line is required for this call type';
  });

  if (form.rubric) {
    const items = form.rubric.items || [];
    if (items.length < 1 || items.length > LIMITS.rubricItems) errors['rubric.items'] = `A checklist needs 1–${LIMITS.rubricItems} items`;
    const seen = new Map();
    items.forEach((it, i) => {
      if (blank(it.label)) errors[`rubric.items[${i}].label`] = 'Label is required';
      else {
        const key = (it.key || '').trim() || keyFromLabel(it.label, 'item');
        if (seen.has(key)) errors[`rubric.items[${i}].label`] = `Too similar to item ${seen.get(key) + 1}`;
        else seen.set(key, i);
      }
      if (blank(it.description)) errors[`rubric.items[${i}].description`] = 'Describe what a pass looks like';
    });

    const actions = form.features?.safetyActions || [];
    const seenActions = new Map();
    actions.forEach((a, i) => {
      if (blank(a.label)) { errors[`features.safetyActions[${i}].label`] = 'Label is required'; return; }
      const key = (a.key || '').trim() || keyFromLabel(a.label, 'action');
      if (seenActions.has(key)) errors[`features.safetyActions[${i}].label`] = `Too similar to action ${seenActions.get(key) + 1}`;
      else seenActions.set(key, i);
    });
    if (actions.length > 0 && !actions.some((a) => a.kind === 'protect')) {
      errors['features.safetyActions'] = 'Add at least one protective action';
    }
  }
  return errors;
}

/** Server paths point at derived keys; show those errors on the label the user typed. */
export function normalizeServerField(field) {
  if (!field) return null;
  return field.replace(/^(rubric\.items\[\d+\]|features\.safetyActions\[\d+\])\.key$/, '$1.label');
}
