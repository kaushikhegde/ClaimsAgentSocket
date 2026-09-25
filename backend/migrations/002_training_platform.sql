-- Drop old tables
DROP TABLE IF EXISTS conversation_logs CASCADE;
DROP TABLE IF EXISTS transcripts CASCADE;
DROP TABLE IF EXISTS claims CASCADE;
DROP TYPE IF EXISTS claim_type;
DROP TYPE IF EXISTS claim_status;
DROP TYPE IF EXISTS severity_level;

-- New enums
CREATE TYPE scenario_mode AS ENUM ('scripted', 'freestyle');

-- Scenarios reference table
CREATE TABLE scenarios (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  persona_name VARCHAR(255),
  persona_backstory TEXT,
  persona_emotional_state VARCHAR(100),
  claim_type VARCHAR(50),
  difficulty VARCHAR(20) DEFAULT 'intermediate',
  max_duration_seconds INTEGER DEFAULT 180
);

-- Training sessions (replaces claims)
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id VARCHAR(50) REFERENCES scenarios(id),
  scenario_mode scenario_mode NOT NULL DEFAULT 'scripted',
  agent_name VARCHAR(255),
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  scores JSONB,
  sentiment JSONB,
  coaching JSONB,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transcripts (updated FK)
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  full_transcript TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation logs (updated FK)
CREATE TABLE conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  message TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_created_at ON training_sessions(created_at DESC);
CREATE INDEX idx_sessions_scenario_id ON training_sessions(scenario_id);
CREATE INDEX idx_transcripts_session_id ON transcripts(session_id);
CREATE INDEX idx_logs_session_id ON conversation_logs(session_id);

-- Seed initial scenarios
INSERT INTO scenarios (id, name, description, persona_name, persona_backstory, persona_emotional_state, claim_type, difficulty) VALUES
('chest-injury', 'Chest Injury Claim', 'Injured worker reporting severe chest pain from a warehouse lifting incident. Customer is distressed and in pain.', 'Marcus Johnson', 'Marcus is a 34-year-old warehouse worker at Metro Logistics. Yesterday at 2 PM, he was lifting heavy boxes alone (his supervisor said he shouldn''t have been doing it solo). He felt a sharp snap in his chest. Went to City General Hospital ER - Dr. Patel diagnosed possible cracked rib and muscle damage. He''s on pain meds and told not to work. He''s worried about lost wages and his family. Policy: WC-2024-88431. Witness: Jenny Park from loading dock. Supervisor: Dave Chen.', 'distressed, in pain, worried about finances', 'workplace_injury', 'beginner'),
('hearing-loss', 'Noise-Induced Hearing Loss', 'Factory worker filing claim for gradual hearing deterioration over 5 years of machinery exposure. Frustrated and confused about process.', 'Linda Torres', 'Linda is a 52-year-old machine operator at Consolidated Manufacturing. She''s worked on the stamping press line for 5 years with inconsistent hearing protection. Over the past year, she''s noticed significant hearing loss - can''t hear conversations in noisy rooms, TV volume keeps going up, ringing in ears. Audiologist Dr. Chen at Hearing Health Clinic confirmed noise-induced sensorineural hearing loss. She''s frustrated because she reported noise concerns to her supervisor Tom Bradley multiple times. Policy: WC-2023-55218. Coworker Mike Davis can confirm the noise levels.', 'frustrated, confused about process, somewhat angry at employer', 'workplace_injury', 'intermediate'),
('physical-injury', 'Physical Injury', 'Construction site fall resulting in multiple fractures. Customer is angry about safety conditions and wants urgent resolution.', 'Robert Williams', 'Robert is a 41-year-old construction worker at Apex Construction. Three days ago, he fell 12 feet from scaffolding that had a broken safety rail he''d reported twice before. He has a broken left arm, fractured collarbone, and bruised ribs. Treated at Memorial Hospital by Dr. Nakamura, currently in a cast and sling. He''s furious about safety negligence and wants to know if he can sue. His wife is 7 months pregnant and he''s the sole earner. Policy: WC-2024-91102. Witnesses: Carlos Mendez and Jim O''Brien. Supervisor: Frank Peters.', 'angry, demanding, scared about finances', 'workplace_injury', 'advanced');
