const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runMigrations } = require('../scripts/migrate');

function fakeDb({ hasTrainingSessions, applied = [] }) {
  const executed = [];
  const appliedSet = new Set(applied);
  const query = async (sql, params) => {
    executed.push({ sql, params });
    if (/to_regclass\('public\.training_sessions'\)/.test(sql)) return { rows: [{ t: hasTrainingSessions ? 'training_sessions' : null }] };
    if (/SELECT filename FROM schema_migrations/.test(sql)) return { rows: [...appliedSet].map((filename) => ({ filename })) };
    if (/INSERT INTO schema_migrations/.test(sql)) { appliedSet.add(params[0]); return { rows: [] }; }
    return { rows: [] };
  };
  const client = { query, release: () => {} };
  return { query, connect: async () => client, executed, appliedSet };
}

function tmpMigrations(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

describe('migration runner', () => {
  it('baselines 001-004 on an existing database and runs only 005', async () => {
    const dir = tmpMigrations({ '001_a.sql': 'CREATE TABLE a();', '004_d.sql': 'CREATE TABLE d();', '005_e.sql': 'CREATE TABLE e();' });
    const db = fakeDb({ hasTrainingSessions: true });
    const out = await runMigrations({ db, dir, log: () => {} });
    assert.deepStrictEqual(out.skipped, ['001_a.sql', '004_d.sql']);
    assert.deepStrictEqual(out.applied, ['005_e.sql']);
    assert.ok(db.executed.some((e) => e.sql === 'CREATE TABLE e();'));
    assert.ok(!db.executed.some((e) => e.sql === 'CREATE TABLE a();'));
  });

  it('runs everything on a fresh database', async () => {
    const dir = tmpMigrations({ '001_a.sql': 'CREATE TABLE a();', '005_e.sql': 'CREATE TABLE e();' });
    const db = fakeDb({ hasTrainingSessions: false });
    const out = await runMigrations({ db, dir, log: () => {} });
    assert.deepStrictEqual(out.applied, ['001_a.sql', '005_e.sql']);
    assert.deepStrictEqual(out.skipped, []);
  });

  it('skips files already recorded', async () => {
    const dir = tmpMigrations({ '005_e.sql': 'CREATE TABLE e();', '006_f.sql': 'CREATE TABLE f();' });
    const db = fakeDb({ hasTrainingSessions: true, applied: ['005_e.sql'] });
    const out = await runMigrations({ db, dir, log: () => {} });
    assert.deepStrictEqual(out.applied, ['006_f.sql']);
  });
});
