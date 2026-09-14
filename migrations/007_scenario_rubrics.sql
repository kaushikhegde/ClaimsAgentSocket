-- Per-scenario caller framing and scoring rubric. NULLs keep the legacy
-- insurance prompt and RTWASA + SOP evaluation.

ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS caller_context TEXT,
  ADD COLUMN IF NOT EXISTS evaluator_role TEXT,
  ADD COLUMN IF NOT EXISTS rubric         JSONB;

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS rubric_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS rubric_snapshot  JSONB;
