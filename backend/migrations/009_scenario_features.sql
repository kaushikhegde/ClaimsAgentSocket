-- Optional training features per scenario (handover note, safety-actions panel,
-- content warning, scripted-only) and the per-session data they produce.

ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}';

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS handover_note      JSONB,
  ADD COLUMN IF NOT EXISTS handover_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS safety_actions     JSONB;

UPDATE scenarios SET features = '{
  "handoverNote": true,
  "scriptedOnly": true,
  "contentWarning": "This scenario simulates a caller experiencing family and domestic violence, including fear, threats and coercive control. Take a break whenever you need to. Support is available through your EAP and 1800RESPECT (1800 737 732).",
  "safetyActions": [
    {"key": "suppressAddress", "label": "Suppress address / record", "kind": "protect"},
    {"key": "removeNominee", "label": "Remove shared nominee", "kind": "protect"},
    {"key": "stopNotifications", "label": "Stop SMS & mailed letters", "kind": "protect"},
    {"key": "separateMedicareCard", "label": "Separate Medicare card", "kind": "protect"},
    {"key": "openCrisisClaim", "label": "Open Crisis Payment claim", "kind": "claim"}
  ]
}'::jsonb
WHERE id = 'fdv-crisis-triage' AND features = '{}'::jsonb;
