-- Add audio file path to training sessions
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS audio_file_path VARCHAR(500);

-- Add RTWASA breakdown to training sessions
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS rtwasa_breakdown JSONB DEFAULT '{}';

-- Add gender to scenarios
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
UPDATE scenarios SET gender = 'male' WHERE id IN ('chest-injury', 'physical-injury');
UPDATE scenarios SET gender = 'female' WHERE id = 'hearing-loss';
