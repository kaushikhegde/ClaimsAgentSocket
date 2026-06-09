/**
 * One-off migration: upload any local recordings in ./audio to Azure Blob under
 * the claims-agent/ prefix, then repoint matching DB rows at the blob copy.
 *
 * Usage:  node scripts/upload-existing-audio.js
 *
 * Safe to re-run (uploads overwrite, DB update is idempotent). Requires the
 * Azure storage vars in .env and a service principal with the
 * "Storage Blob Data Contributor" role on the storage account/container.
 */
const fs = require('fs');
const path = require('path');
const blobStorage = require('../src/storage/blob');
const logger = require('../src/utils/logger');

const AUDIO_DIR = path.join(__dirname, '../audio');

async function main() {
  if (!blobStorage.isConfigured()) {
    logger.error('Azure Blob storage is not configured — check the .env vars.');
    process.exit(1);
  }

  if (!fs.existsSync(AUDIO_DIR)) {
    logger.info('No local audio/ directory — nothing to upload.');
    return;
  }

  const files = fs.readdirSync(AUDIO_DIR).filter((f) => f.toLowerCase().endsWith('.wav'));
  if (files.length === 0) {
    logger.info('No .wav files found in audio/ — nothing to upload.');
    return;
  }

  logger.info(`Uploading ${files.length} recording(s) to claims-agent/ ...`);

  const uploaded = [];
  for (const file of files) {
    try {
      const buffer = fs.readFileSync(path.join(AUDIO_DIR, file));
      const blobName = await blobStorage.uploadAudio(file, buffer);
      uploaded.push({ file, blobName });
      logger.info(`  ✓ ${file} -> ${blobName}`);
    } catch (err) {
      logger.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  // Best-effort: repoint DB rows from audio/<f> to claims-agent/<f>.
  // Skipped silently if the DB is unreachable (e.g. local run blocked by firewall).
  try {
    const pool = require('../src/db/pool');
    let updated = 0;
    for (const { file, blobName } of uploaded) {
      const res = await pool.query(
        'UPDATE training_sessions SET audio_file_path = $1 WHERE audio_file_path = $2',
        [blobName, `audio/${file}`]
      );
      updated += res.rowCount;
    }
    logger.info(`Repointed ${updated} DB row(s) to blob storage.`);
    await pool.end();
  } catch (err) {
    logger.warn(`Skipped DB update (${err.message}). Re-run from a host that can reach the DB.`);
  }

  logger.info(`Done. ${uploaded.length}/${files.length} file(s) uploaded.`);
}

main().catch((err) => {
  logger.error('Upload failed:', err.message);
  process.exit(1);
});
