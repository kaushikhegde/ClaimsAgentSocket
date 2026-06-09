function buildEvaluationPrompt(transcript, scenarioContext) {
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

OVERALL SCORE: Weighted average — Empathy (18%), Compliance (13%), Information Gathering (18%), Question Quality (13%), Tone (8%), Talk/Listen (8%), Filler Words (4%), Response Time (4%), RTWASA Compliance (14%).

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
    "rtwasaCompliance": <number>
  },
  "rtwasaBreakdown": {
    "incomeSupport": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "medicalSupport": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "returnToWorkServices": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "seriousInjuryClassification": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "lumpSumPayments": {"mentioned": <boolean>, "details": "<what was said or empty>"},
    "legalReference": {"mentioned": <boolean>, "details": "<what was said or empty>"}
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

module.exports = { buildEvaluationPrompt };
