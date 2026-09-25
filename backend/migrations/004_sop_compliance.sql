-- Add SOP (return-to-work relationship) compliance breakdown to training sessions
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS sop_breakdown JSONB DEFAULT '{}';
