// Starting points for new scenarios. They only pre-fill the builder form; nothing is saved until the user saves.
// Keep in sync with the seed data they mirror:
//   insurance → backend/migrations/005_elevenlabs_scenarios.sql (Marcus Johnson)
//   fdv       → backend/migrations/008_seed_fdv_crisis_triage.sql + 009_scenario_features.sql

const INSURANCE_PERSONA = {
  "name": "Marcus Johnson",
  "gender": "male",
  "backstory": "Marcus is a 34-year-old warehouse worker at Metro Logistics. Yesterday at 2 PM, he was lifting heavy boxes alone (his supervisor said he shouldn't have been doing it solo). He felt a sharp snap in his chest. Went to City General Hospital ER - Dr. Patel diagnosed possible cracked rib and muscle damage. He's on pain meds and told not to work. He's worried about lost wages and his family. Policy: WC-2024-88431. Witness: Jenny Park from loading dock. Supervisor: Dave Chen.",
  "emotionalState": "distressed, in pain, worried about finances",
  "openingLine": "Hi, um… yeah, I need to file a claim. I hurt my chest lifting at work yesterday and the doctor says I can't work."
};

const FDV = {
  "name": "FDV Emergency Separation & Crisis Triage",
  "description": "A caller experiencing family and domestic violence needs urgent financial help. Practise safety-first, trauma-informed triage: recognise silent cues, protect records, confirm the qualifying event date gently and arrange a warm social work referral.",
  "claimType": "crisis_support",
  "difficulty": "advanced",
  "maxDurationSeconds": 420,
  "callerContext": "You are calling Services Australia. You have recently left, or are about to leave, a home where you experienced family and domestic violence, and you urgently need financial help. You are not calling to \"make a claim\" — you are frightened, exhausted, may not be safe, and you do not know what help exists. You share records with your (ex-)partner (for example Family Tax Benefit, a Medicare card, a bank account, or they are listed as a nominee) but you do NOT raise these risks yourself unless the officer asks. Do not describe the violence in detail; if pushed for details you find distressing, become quieter and more reluctant. If the officer is calm, explains why they are asking and gives you choices, slowly open up. If they sound like an interrogator or tell you to call somewhere else, get upset and consider hanging up.",
  "evaluatorRole": "expert trainer in trauma-informed, safety-first frontline service delivery for Services Australia (family and domestic violence, Crisis Payment and social work referral)",
  "rubric": {
    "title": "FDV Crisis Triage Protocol",
    "items": [
      {
        "key": "safetyCheckEarly",
        "label": "Safety to speak",
        "critical": true,
        "description": "Early in the call, asked whether the caller is safe and able to speak right now (e.g. \"Are you in a safe place to talk?\"), and checked again after any sign of danger or interruption."
      },
      {
        "key": "silentCueResponse",
        "label": "Responds to silent cues",
        "critical": true,
        "description": "When the caller whispered, went silent, was interrupted or used coded language, the officer adapted: switched to yes/no questions, offered a safe callback time or method, and did not press or talk over the silence."
      },
      {
        "key": "noRetraumatisation",
        "label": "No retelling of trauma",
        "critical": true,
        "description": "Did not ask the caller to describe the violence beyond what was needed; explained why sensitive questions were asked; handled the whole need in one contact rather than transferring the caller to tell their story again."
      },
      {
        "key": "eventDateElicited",
        "label": "Event date confirmed gently",
        "description": "Confirmed the date of the qualifying event (when the caller left home or the incident occurred) needed for Crisis Payment timing, using gentle anchoring (e.g. \"was that before or after the weekend?\") rather than demanding an exact date."
      },
      {
        "key": "traumaInformedPacing",
        "label": "Trauma-informed pacing",
        "description": "Calm, unhurried and non-judgemental; validated the caller; offered choice and control; avoided bureaucratic or interrogating language and never implied blame."
      },
      {
        "key": "privacyProtections",
        "label": "Record protections",
        "critical": true,
        "description": "Raised protecting the caller's information from the other party: address/record suppression, removing or reviewing a shared nominee, the risk of letters/SMS notifications, and separate Medicare/shared payment arrangements — before progressing the payment."
      },
      {
        "key": "warmReferral",
        "label": "Warm social work referral",
        "description": "Offered a social worker referral with the caller's consent, explained what happens next and reassured them they would not need to repeat their story."
      },
      {
        "key": "emergencyEscalation",
        "label": "Emergency pathway",
        "description": "If there was any sign of immediate danger, advised calling 000 and/or offered 1800RESPECT appropriately without abruptly ending the call. Mark na only if no danger indicators arose."
      }
    ]
  },
  "features": {
    "handoverNote": true,
    "scriptedOnly": true,
    "contentWarning": "This scenario simulates a caller experiencing family and domestic violence, including fear, threats and coercive control. Take a break whenever you need to. Support is available through your EAP and 1800RESPECT (1800 737 732).",
    "safetyActions": [
      {
        "key": "suppressAddress",
        "label": "Suppress address / record",
        "kind": "protect"
      },
      {
        "key": "removeNominee",
        "label": "Remove shared nominee",
        "kind": "protect"
      },
      {
        "key": "stopNotifications",
        "label": "Stop SMS & mailed letters",
        "kind": "protect"
      },
      {
        "key": "separateMedicareCard",
        "label": "Separate Medicare card",
        "kind": "protect"
      },
      {
        "key": "openCrisisClaim",
        "label": "Open Crisis Payment claim",
        "kind": "claim"
      }
    ]
  },
  "personas": [
    {
      "name": "Jess Harper",
      "gender": "female",
      "backstory": "Jess is 31 and is calling in a whisper from the bathroom of the house she shares with her partner Brad, who is in the lounge room. Brad controls the money, has taken her bank card and is listed as a nominee on her Centrelink record. Last night he threw a chair and threatened her; she has decided to leave tomorrow morning while he is at work and go to her sister in Elizabeth. She has a 3-year-old daughter, Mia, and they receive Family Tax Benefit. SITUATIONAL CUES: speak quietly and in short bursts. At first, say you are calling \"about my phone bill\" and only drop the code if the officer asks if you are safe or can talk freely. About a minute into the call, you hear Brad: say \"sorry — hang on\" and go completely silent for a moment, then say \"okay… he went outside\". If the officer asks yes/no questions you answer easily; open questions make you anxious. If offered a safe callback, choose tomorrow after 9am on your sister's mobile. The qualifying event (leaving home) has not happened yet — it is planned for tomorrow.",
      "emotionalState": "terrified, whispering, hyper-alert, desperate for help but afraid of being overheard",
      "openingLine": "Hi… um, sorry, I have to be quick. I'm calling about… my phone bill."
    },
    {
      "name": "Leanne Walker",
      "gender": "female",
      "backstory": "Leanne is 42 and left her husband Craig four days ago after he assaulted her; police attended and an interim intervention order is in place. She is now in a women's refuge in regional South Australia with her two sons, aged 8 and 11. She left with nothing but her phone and a bag of clothes. She receives Family Tax Benefit on a joint record with Craig, the boys are on Craig's Medicare card, and the family has a joint bank account where payments go. Mail still goes to the old house, which is Craig's address. She is exhausted and foggy and genuinely unsure of the exact date she left — she remembers it was the night of her eldest son's footy training, \"Tuesday, I think… or Monday\", and can confirm it if the officer anchors it to events. She has already been transferred twice today and is at the end of her tether. SITUATIONAL CUES: flat, tired voice with long pauses. If asked to \"explain what happened\", say quietly \"do I have to go through all of it again?\" and shut down unless the officer reassures her.",
      "emotionalState": "exhausted, flat, overwhelmed, wary after being transferred twice",
      "openingLine": "Hi. I've been passed around all morning… I just need some help. I've left my husband and I've got nothing."
    }
  ]
};

export const SCENARIO_TEMPLATES = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Start from an empty scenario.',
    build: () => ({}),
  },
  {
    id: 'insurance',
    label: 'Insurance claim',
    description: 'Workplace injury caller, scored on the RTWASA + SOP rubric.',
    build: () => ({
      name: 'Workplace injury claim',
      description: 'Injured worker calling to lodge a workers compensation claim.',
      claimType: 'workplace_injury',
      difficulty: 'beginner',
      maxDurationSeconds: 180,
      personas: [{ ...INSURANCE_PERSONA }],
    }),
  },
  {
    id: 'fdv',
    label: 'FDV crisis triage',
    description: 'Family & domestic violence caller with checklist, handover note and safety actions.',
    build: () => structuredClone(FDV),
  },
];
