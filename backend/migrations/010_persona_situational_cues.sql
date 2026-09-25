-- Situational cues (whispering, interruptions, going quiet, coded language) get
-- their own persona field instead of living inside the backstory. Existing cues
-- stay in the backstory text and keep working; nothing is moved automatically.

ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS situational_cues TEXT;
