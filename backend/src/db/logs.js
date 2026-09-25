const pool = require('./pool');

const BATCH_SIZE = 500;

async function insertLog(sessionId, role, message, client) {
  const db = client || pool;
  const result = await db.query(
    `INSERT INTO conversation_logs (session_id, role, message)
     VALUES ($1, $2, $3) RETURNING id`,
    [sessionId, role, message]
  );
  return result.rows[0];
}

async function insertBatchLogs(sessionId, entries, client, sessionStartTime) {
  const db = client || pool;
  if (entries.length === 0) return;

  const startMs = sessionStartTime ? new Date(sessionStartTime).getTime() : Date.now();

  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    const batch = entries.slice(start, start + BATCH_SIZE);
    const values = [];
    const params = [];

    batch.forEach((entry, i) => {
      const offset = i * 4;
      const ts = new Date(startMs + (entry.elapsed || 0) * 1000).toISOString();
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      params.push(sessionId, entry.role, entry.message, ts);
    });

    await db.query(
      `INSERT INTO conversation_logs (session_id, role, message, timestamp) VALUES ${values.join(', ')}`,
      params
    );
  }
}

module.exports = { insertLog, insertBatchLogs };
