CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE claim_type AS ENUM (
    'auto_accident', 'workplace_injury', 'slip_and_fall',
    'medical_malpractice', 'property_damage', 'general_injury'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM ('draft', 'complete', 'needs_followup');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE severity_level AS ENUM ('minor', 'moderate', 'severe', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_type claim_type NOT NULL,
  status claim_status NOT NULL DEFAULT 'draft',
  claimant_name VARCHAR(255),
  claimant_phone VARCHAR(50),
  claimant_email VARCHAR(255),
  policy_number VARCHAR(100),
  incident_date DATE,
  incident_location TEXT,
  incident_description TEXT,
  severity severity_level,
  type_specific_details JSONB DEFAULT '{}',
  witnesses JSONB DEFAULT '[]',
  medical_provider JSONB DEFAULT '{}',
  additional_notes TEXT,
  missing_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  full_transcript TEXT NOT NULL,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_claim_id ON transcripts(claim_id);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_claim_id ON conversation_logs(claim_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON claims(created_at DESC);
