const pool = require('./pool');

async function insertTranscript(sessionId, fullTranscript, durationSeconds, client) {
  const db = client || pool;
  const result = await db.query(
    `INSERT INTO transcripts (session_id, full_transcript, duration_seconds)
     VALUES ($1, $2, $3) RETURNING id`,
    [sessionId, fullTranscript, durationSeconds]
  );
  return result.rows[0];
}

module.exports = { insertTranscript };
