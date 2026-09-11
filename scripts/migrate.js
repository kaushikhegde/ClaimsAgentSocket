// Runs each migrations/*.sql once, tracked in schema_migrations. Existing
// databases (pre-tracking) are baselined: files before 005 are marked applied
// when training_sessions already exists, because 001 cannot be replayed on Azure.
const fs = require('fs');
const path = require('path');

const BASELINE_BEFORE = '005';

async function runMigrations({ db, dir = path.join(__dirname, '../migrations'), log = console.log } = {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const appliedRes = await db.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map((r) => r.filename));
  const skipped = [];

  if (applied.size === 0) {
    const existing = await db.query(`SELECT to_regclass('public.training_sessions') AS t`);
    if (existing.rows[0] && existing.rows[0].t) {
      for (const f of files) {
        if (f < BASELINE_BEFORE) {
          await db.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
          applied.add(f);
          skipped.push(f);
          log(`Baselined ${f} (already present)`);
        }
      }
    }
  }

  const ran = [];
  for (const f of files) {
    if (applied.has(f)) { if (!skipped.includes(f)) skipped.push(f); continue; }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
      await client.query('COMMIT');
      ran.push(f);
      log(`Applied ${f}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
  return { applied: ran, skipped };
}

if (require.main === module) {
  const pool = require('../src/db/pool');
  runMigrations({ db: pool })
    .then(({ applied, skipped }) => {
      console.log(`Migrations complete — applied ${applied.length}, skipped ${skipped.length}`);
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { runMigrations };
