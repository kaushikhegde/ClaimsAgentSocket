-- The Azure Blob copy of a scenario document is a best-effort backup; ElevenLabs holds the working copy.
ALTER TABLE scenario_documents ALTER COLUMN blob_path DROP NOT NULL;
