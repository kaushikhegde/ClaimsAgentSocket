-- Demo scenario: Family & Domestic Violence emergency separation & crisis triage.
-- Content is a draft for an early demo and needs subject-matter-expert review
-- (in particular the legislative references). Idempotent: skips if already present.

INSERT INTO scenarios (id, name, description, claim_type, difficulty, max_duration_seconds, caller_context, evaluator_role, rubric)
VALUES (
  'fdv-crisis-triage',
  'FDV Emergency Separation & Crisis Triage',
  'A caller experiencing family and domestic violence needs urgent financial help. Practise safety-first, trauma-informed triage: recognise silent cues, protect records, confirm the qualifying event date gently and arrange a warm social work referral.',
  'crisis_support',
  'advanced',
  420,
  'You are calling Services Australia. You have recently left, or are about to leave, a home where you experienced family and domestic violence, and you urgently need financial help. You are not calling to "make a claim" — you are frightened, exhausted, may not be safe, and you do not know what help exists. You share records with your (ex-)partner (for example Family Tax Benefit, a Medicare card, a bank account, or they are listed as a nominee) but you do NOT raise these risks yourself unless the officer asks. Do not describe the violence in detail; if pushed for details you find distressing, become quieter and more reluctant. If the officer is calm, explains why they are asking and gives you choices, slowly open up. If they sound like an interrogator or tell you to call somewhere else, get upset and consider hanging up.',
  'expert trainer in trauma-informed, safety-first frontline service delivery for Services Australia (family and domestic violence, Crisis Payment and social work referral)',
  '{
    "title": "FDV Crisis Triage Protocol",
    "items": [
      {"key": "safetyCheckEarly", "label": "Safety to speak", "critical": true,
       "description": "Early in the call, asked whether the caller is safe and able to speak right now (e.g. \"Are you in a safe place to talk?\"), and checked again after any sign of danger or interruption."},
      {"key": "silentCueResponse", "label": "Responds to silent cues", "critical": true,
       "description": "When the caller whispered, went silent, was interrupted or used coded language, the officer adapted: switched to yes/no questions, offered a safe callback time or method, and did not press or talk over the silence."},
      {"key": "noRetraumatisation", "label": "No retelling of trauma", "critical": true,
       "description": "Did not ask the caller to describe the violence beyond what was needed; explained why sensitive questions were asked; handled the whole need in one contact rather than transferring the caller to tell their story again."},
      {"key": "eventDateElicited", "label": "Event date confirmed gently",
       "description": "Confirmed the date of the qualifying event (when the caller left home or the incident occurred) needed for Crisis Payment timing, using gentle anchoring (e.g. \"was that before or after the weekend?\") rather than demanding an exact date."},
      {"key": "traumaInformedPacing", "label": "Trauma-informed pacing",
       "description": "Calm, unhurried and non-judgemental; validated the caller; offered choice and control; avoided bureaucratic or interrogating language and never implied blame."},
      {"key": "privacyProtections", "label": "Record protections", "critical": true,
       "description": "Raised protecting the caller''s information from the other party: address/record suppression, removing or reviewing a shared nominee, the risk of letters/SMS notifications, and separate Medicare/shared payment arrangements — before progressing the payment."},
      {"key": "warmReferral", "label": "Warm social work referral",
       "description": "Offered a social worker referral with the caller''s consent, explained what happens next and reassured them they would not need to repeat their story."},
      {"key": "emergencyEscalation", "label": "Emergency pathway",
       "description": "If there was any sign of immediate danger, advised calling 000 and/or offered 1800RESPECT appropriately without abruptly ending the call. Mark na only if no danger indicators arose."}
    ]
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personas (scenario_id, name, gender, backstory, emotional_state, opening_line, sort_order)
SELECT v.scenario_id, v.name, v.gender, v.backstory, v.emotional_state, v.opening_line, v.sort_order
FROM (VALUES
  ('fdv-crisis-triage', 'Jess Harper', 'female',
   'Jess is 31 and is calling in a whisper from the bathroom of the house she shares with her partner Brad, who is in the lounge room. Brad controls the money, has taken her bank card and is listed as a nominee on her Centrelink record. Last night he threw a chair and threatened her; she has decided to leave tomorrow morning while he is at work and go to her sister in Elizabeth. She has a 3-year-old daughter, Mia, and they receive Family Tax Benefit. SITUATIONAL CUES: speak quietly and in short bursts. At first, say you are calling "about my phone bill" and only drop the code if the officer asks if you are safe or can talk freely. About a minute into the call, you hear Brad: say "sorry — hang on" and go completely silent for a moment, then say "okay… he went outside". If the officer asks yes/no questions you answer easily; open questions make you anxious. If offered a safe callback, choose tomorrow after 9am on your sister''s mobile. The qualifying event (leaving home) has not happened yet — it is planned for tomorrow.',
   'terrified, whispering, hyper-alert, desperate for help but afraid of being overheard',
   'Hi… um, sorry, I have to be quick. I''m calling about… my phone bill.', 0),
  ('fdv-crisis-triage', 'Leanne Walker', 'female',
   'Leanne is 42 and left her husband Craig four days ago after he assaulted her; police attended and an interim intervention order is in place. She is now in a women''s refuge in regional South Australia with her two sons, aged 8 and 11. She left with nothing but her phone and a bag of clothes. She receives Family Tax Benefit on a joint record with Craig, the boys are on Craig''s Medicare card, and the family has a joint bank account where payments go. Mail still goes to the old house, which is Craig''s address. She is exhausted and foggy and genuinely unsure of the exact date she left — she remembers it was the night of her eldest son''s footy training, "Tuesday, I think… or Monday", and can confirm it if the officer anchors it to events. She has already been transferred twice today and is at the end of her tether. SITUATIONAL CUES: flat, tired voice with long pauses. If asked to "explain what happened", say quietly "do I have to go through all of it again?" and shut down unless the officer reassures her.',
   'exhausted, flat, overwhelmed, wary after being transferred twice',
   'Hi. I''ve been passed around all morning… I just need some help. I''ve left my husband and I''ve got nothing.', 1)
) AS v(scenario_id, name, gender, backstory, emotional_state, opening_line, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM personas p WHERE p.scenario_id = 'fdv-crisis-triage');
