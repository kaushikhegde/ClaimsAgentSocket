function buildEvaluationPrompt(transcript, scenarioContext) {
  const rubric = scenarioContext && scenarioContext.rubric;
  if (rubric && Array.isArray(rubric.items) && rubric.items.length > 0) {
    return buildRubricEvaluationPrompt(transcript, scenarioContext);
  }
  return buildLegacyEvaluationPrompt(transcript, scenarioContext);
}

/** Scenario-defined checklist. Scores are recomputed server-side from the statuses (see schema.js). */
function buildRubricEvaluationPrompt(transcript, ctx) {
  const role = (ctx.evaluatorRole && ctx.evaluatorRole.trim()) || 'expert contact-centre training evaluator';
  const items = ctx.rubric.items;
  const itemLines = items
    .map((it) => `   - ${it.key}${it.critical ? ' [CRITICAL]' : ''} — ${it.label}: ${it.description}`)
    .join('\n');
  const breakdownJson = items
    .map((it) => `    "${it.key}": {"status": "<pass|partial|fail|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"}`)
    .join(',\n');
  const handoverBlock = buildHandoverBlock(ctx);
  const actionsBlock = buildActionsBlock(ctx);
  const handoverJson = ctx.handoverEnabled && ctx.handoverNote
    ? `,
  "handover": {
    "completeness": <number>,
    "captured": ["<fact from the call correctly recorded in the note>"],
    "missing": ["<fact disclosed in the call but absent from the note>"],
    "incorrect": ["<fact recorded wrongly, with what the caller actually said>"]
  }`
    : '';

  return `You are an ${role}. Analyze this training call transcript where a frontline officer (the trainee, "agent") handled a simulated caller.

SCENARIO CONTEXT:
- Scenario: ${ctx.scenarioName || ctx.name}
- Call context: ${ctx.callerContext || 'n/a'}
- Caller Persona: ${ctx.personaName}
- Emotional State: ${ctx.emotionalState}

TRANSCRIPT:
${transcript}

EVALUATE the agent. Score each general dimension 0-100:

1. EMPATHY: Acknowledged emotions, warmth, validation, active listening, trauma-aware responses.
2. QUESTION QUALITY: One question at a time, open-ended when appropriate, logical flow, explained why sensitive questions were needed.
3. TONE CONSISTENCY: Calm, professional and warm throughout; no abrupt or bureaucratic shifts.
4. TALK/LISTEN RATIO: Target roughly 40% agent / 60% caller. Estimate from turn lengths.
5. FILLER WORDS: 100 for no filler words ("um", "uh", "like", "you know", "basically"), decreasing proportionally.
6. RESPONSE TIME: Perceived responsiveness; no awkward gaps or rushing.

SCENARIO CHECKLIST — "${ctx.rubric.title || 'Scenario Checklist'}". For EACH item assign a status:
   - "pass": clearly demonstrated
   - "partial": partially or weakly demonstrated
   - "fail": the situation called for it and the agent did not do it (or did the opposite)
   - "na": the situation genuinely never arose in this call — do NOT use "na" just because the agent missed it
${itemLines}
For each item give a short evidence quote from the transcript and a timestamp reference (empty strings if na). Items marked [CRITICAL] are safety-critical: be strict.
${handoverBlock}${actionsBlock}
SENTIMENT ANALYSIS: 6-10 data points evenly spaced through the conversation:
- agentTone: -1.0 (cold/negative) to 1.0 (warm/positive)
- customerMood: -1.0 (distressed/upset) to 1.0 (calm/reassured)

COACHING: Specific, actionable feedback referencing the checklist where relevant:
- strengths: 2-4 things done well, with timestamp references
- improvements: 2-4 areas to improve (prioritise any failed CRITICAL items), with timestamp references
- alternatives: for the 1-2 weakest moments, a better response the agent could have given

Return ONLY valid JSON in this exact format:
{
  "scores": {
    "empathy": <number>,
    "questionQuality": <number>,
    "toneConsistency": <number>,
    "talkListenRatio": <number>,
    "fillerWords": <number>,
    "responseTime": <number>
  },
  "rubricBreakdown": {
${breakdownJson}
  }${handoverJson},
  "sentiment": [
    {"timestamp": <seconds>, "agentTone": <-1 to 1>, "customerMood": <-1 to 1>}
  ],
  "coaching": {
    "strengths": [{"text": "<description>", "reference": "<timestamp>"}],
    "improvements": [{"text": "<description>", "reference": "<timestamp>"}],
    "alternatives": [{"original": "<what agent said>", "suggested": "<better response>", "reference": "<timestamp>"}]
  }
}`;
}

const HANDOVER_LABELS = {
  safetyStatus: 'Safety status & risk',
  safeContact: 'Safe contact method / time',
  eventDate: 'Qualifying event date',
  dependants: 'Children / dependants',
  immediateNeeds: 'Immediate needs',
  protections: 'Record protections actioned / outstanding',
  referralConsent: 'Referral consent',
  summary: 'Summary for the social worker',
};

function buildHandoverBlock(ctx) {
  if (!ctx.handoverEnabled || !ctx.handoverNote) return '';
  const lines = Object.entries(HANDOVER_LABELS)
    .map(([key, label]) => `- ${label}: ${ctx.handoverNote[key] || '(blank)'}`)
    .join('\n');
  return `
HANDOVER NOTE (written by the agent after the call for the receiving social worker):
${lines}

Assess the handover note against the transcript. List every relevant fact the CALLER DISCLOSED that a social worker would need so the caller does not have to repeat their story (safety situation, safe contact arrangements, event date, children, immediate needs, record risks, consent). Then:
- "captured": facts correctly recorded in the note
- "missing": facts disclosed in the call but absent from the note
- "incorrect": facts recorded wrongly
- "completeness": round(captured / (captured + missing + incorrect) * 100); 0 if nothing relevant was disclosed.
Do NOT penalise the note for facts the caller never disclosed.
`;
}

function buildActionsBlock(ctx) {
  const seq = ctx.actionSequencing;
  if (!seq || !Array.isArray(seq.items)) return '';
  const fmt = (s) => (s === null || s === undefined ? 'not done' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  const lines = seq.items.map((a) => `- ${a.label} (${a.kind === 'claim' ? 'opens the claim' : 'protective'}): ${fmt(a.at)}${a.kind === 'protect' ? ` → ${a.status}` : ''}`).join('\n');
  return `
SYSTEM ACTIONS TIMELINE (clicked by the agent during the call; sequencing is already scored separately — use this only to inform coaching, e.g. protections done after opening the claim or never done):
${lines}
`;
}

function buildLegacyEvaluationPrompt(transcript, scenarioContext) {
  return `You are an expert insurance training evaluator. Analyze this training call transcript where an insurance agent (the trainee) handled a simulated customer call.

SCENARIO CONTEXT:
- Scenario: ${scenarioContext.scenarioName || scenarioContext.name}
- Customer Persona: ${scenarioContext.personaName}
- Emotional State: ${scenarioContext.emotionalState}
- Claim Type: ${scenarioContext.claimType}

TRANSCRIPT:
${transcript}

EVALUATE the agent's performance using this rubric. Score each dimension 0-100:

1. EMPATHY (0-100): Did the agent acknowledge emotions? Show warmth? Use active listening cues ("I understand", "That must be difficult")? Respond appropriately to emotional escalation/de-escalation?

2. COMPLIANCE (0-100): Did the agent identify as an AI at the start? Avoid giving legal/medical advice? Follow proper greeting and closing protocol? Stay on topic?

3. INFORMATION GATHERING (0-100): How complete was the data collected? Required: name, contact info, policy number, incident date/location/description, witnesses, medical provider, severity. Score based on % of applicable fields gathered.

4. QUESTION QUALITY (0-100): Did the agent ask one question at a time (vs. multi-part questions)? Were questions open-ended when appropriate? Did they follow a logical flow? Did they follow up on important details?

5. TONE CONSISTENCY (0-100): Was the agent professional and warm throughout? Any abrupt tone shifts? Did they maintain composure even if the customer was difficult?

6. TALK/LISTEN RATIO (0-100): Target is 40% agent / 60% customer. Score 100 if close to this ratio, lower if the agent talked too much or too little. Estimate from transcript turn lengths.

7. FILLER WORDS (0-100): Count instances of "um", "uh", "like", "you know", "so", "basically", "actually" used as fillers. Score 100 for none, decrease proportionally.

8. RESPONSE TIME (0-100): Based on conversation flow, did the agent respond promptly? Were there awkward pauses or rushed responses? Score based on perceived responsiveness.

9. RTWASA COMPLIANCE (0-100): Did the agent properly inform the customer about relevant Return to Work SA interim benefits under the Return to Work Act 2014? Score based on which of these were addressed:
   - Income Support: Worker gets 100% of average weekly earnings for up to 52 weeks from the first day of incapacity, then 80% for up to another 52 weeks
   - Medical Support: Coverage for medical/treatment expenses up to one year after income support ceases, plus travel expenses to appointments
   - Return to Work Services: Job placement and retraining services available
   - Serious Injury Classification: For severe cases, option to apply to ReturnToWorkSA for interim serious injury classification (lifetime treatment and care)
   - Lump Sum Payments: Possibility of lump sum payment after permanent impairment assessment
   - Legal Reference: Referenced the Return to Work Act 2014 where appropriate
   Score: 0 if none mentioned, ~15-17 points per item addressed correctly, up to 100 for comprehensive coverage.

10. SOP COMPLIANCE (0-100): Assess the agent against the Safe Work Australia SOP "Managing the relationship with an injured or ill worker during return to work". For EACH of the 9 behaviours below, assign a status:
   - "pass": clearly demonstrated
   - "partial": partially or weakly demonstrated
   - "na": could not reasonably apply in this call — do NOT penalise the agent for these
   Behaviours:
   - earlySupportiveContact: Early, supportive contact framed as checking in, not interrogating
   - careBeforeInjury: Asked how the worker IS before drilling into injury/claim details
   - openEndedListening: Used open-ended questions and active listening; let the worker guide
   - healthFirstFraming: Made clear recovery/health (physical and mental) is the priority
   - confidentiality: Assured privacy; did not suggest disclosing details to others without consent
   - counsellorBoundary: For psychological injury, offered support without overstepping into counselling; avoided assumptions (e.g. asked "what does that mean for you?")
   - gradualReturnCapability: Discussed a gradual return; focused on what the worker CAN do; reassured they don't need to be 100%
   - suitableDuties: Explored modified/suitable duties; deferred to health professional advice / certificate of capacity
   - keepInTouchPlan: Agreed a contact preference/frequency; set a next check-in or realistic goals
   Compute scores.sopCompliance = round((passes + 0.5 * partials) / applicable * 100), where applicable = the number of behaviours NOT marked "na". If all 9 are "na", scores.sopCompliance = 0. For each behaviour give a short evidence quote and a timestamp reference (empty strings if na).

OVERALL SCORE: Weighted average — Empathy (16%), Compliance (10%), Information Gathering (16%), Question Quality (12%), Tone (7%), Talk/Listen (7%), Filler Words (4%), Response Time (4%), RTWASA Compliance (12%), SOP Compliance (12%).

SENTIMENT ANALYSIS: Track the emotional arc of the conversation. Provide 6-10 data points evenly spaced through the conversation:
- agentTone: -1.0 (cold/negative) to 1.0 (warm/positive)
- customerMood: -1.0 (angry/upset) to 1.0 (calm/satisfied)

COACHING: Provide specific, actionable feedback:
- strengths: 2-4 specific things the agent did well, with timestamp references
- improvements: 2-4 specific areas to improve, with timestamp references
- alternatives: For the 1-2 weakest moments, provide a better response the agent could have given

Return ONLY valid JSON in this exact format:
{
  "overallScore": <number>,
  "scores": {
    "empathy": <number>,
    "compliance": <number>,
    "informationGathering": <number>,
    "questionQuality": <number>,
    "toneConsistency": <number>,
    "talkListenRatio": <number>,
    "fillerWords": <number>,
    "responseTime": <number>,
    "rtwasaCompliance": <number>,
    "sopCompliance": <number>
  },
  "rtwasaBreakdown": {
    "incomeSupport": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "medicalSupport": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "returnToWorkServices": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "seriousInjuryClassification": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "lumpSumPayments": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "legalReference": {"mentioned": <boolean>, "details": "<what was said or empty>"}
  },
  "sopBreakdown": {
    "earlySupportiveContact": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"},
    "careBeforeInjury": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"},
    "openEndedListening": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"},
    "healthFirstFraming": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"},
    "confidentiality": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"},
    "counsellorBoundary": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"},
    "gradualReturnCapability": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"},
    "suitableDuties": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"},
    "keepInTouchPlan": {"status": "<pass|partial|na>", "evidence": "<quote or empty>", "reference": "<timestamp or empty>"}
  },
  "sentiment": [
    {"timestamp": <seconds>, "agentTone": <-1 to 1>, "customerMood": <-1 to 1>}
  ],
  "coaching": {
    "strengths": [
      {"text": "<description>", "reference": "<timestamp>"}
    ],
    "improvements": [
      {"text": "<description>", "reference": "<timestamp>"}
    ],
    "alternatives": [
      {"original": "<what agent said>", "suggested": "<better response>", "reference": "<timestamp>"}
    ]
  }
}`;
}

module.exports = { buildEvaluationPrompt, buildRubricEvaluationPrompt, buildLegacyEvaluationPrompt };
