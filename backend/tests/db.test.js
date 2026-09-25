const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const pool = require('../src/db/pool');
const { insertClaim, getClaimById } = require('../src/db/claims');
const { insertTranscript } = require('../src/db/transcripts');
const { insertBatchLogs } = require('../src/db/logs');
const fs = require('fs');
const path = require('path');

describe('DB Layer', () => {
  before(async () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '../migrations/001_initial.sql'), 'utf8'
    );
    await pool.query(migration);
  });

  after(async () => {
    await pool.end();
  });

  it('should insert and retrieve a claim', async () => {
    const claim = await insertClaim({
      claimType: 'auto_accident',
      status: 'complete',
      claimant: {
        fullName: 'John Doe',
        phone: '555-0100',
        email: 'john@example.com',
        policyNumber: 'POL-12345',
      },
      incident: {
        date: '2026-03-15',
        location: '123 Main St',
        description: 'Rear-ended at a stoplight',
        severity: 'moderate',
      },
      details: { vehicleInfo: { make: 'Toyota', model: 'Camry', year: 2024 } },
      witnesses: [{ name: 'Jane Smith', contact: '555-0200' }],
      medicalProvider: { name: 'City Hospital', contact: '555-0300' },
      additionalNotes: 'Driver was cooperative',
      missingFields: [],
    });

    assert.ok(claim.id);
    assert.ok(claim.created_at);

    const retrieved = await getClaimById(claim.id);
    assert.strictEqual(retrieved.claimant_name, 'John Doe');
    assert.strictEqual(retrieved.claim_type, 'auto_accident');
    assert.strictEqual(retrieved.status, 'complete');
  });

  it('should insert a transcript linked to a claim', async () => {
    const claim = await insertClaim({
      claimType: 'slip_and_fall',
      status: 'draft',
      claimant: { fullName: 'Test User' },
      incident: { description: 'Slipped on wet floor' },
    });

    const transcript = await insertTranscript(
      claim.id, 'Agent: Hello\nUser: I slipped on a wet floor', 120
    );
    assert.ok(transcript.id);
  });

  it('should insert batch conversation logs', async () => {
    const claim = await insertClaim({
      claimType: 'general_injury',
      status: 'draft',
      claimant: { fullName: 'Log Test' },
      incident: { description: 'Test' },
    });

    await insertBatchLogs(claim.id, [
      { role: 'agent', message: 'Hello, how can I help?' },
      { role: 'claimant', message: 'I was injured at work' },
      { role: 'agent', message: 'Can you tell me more?' },
    ]);

    const result = await pool.query(
      'SELECT COUNT(*) FROM conversation_logs WHERE claim_id = $1',
      [claim.id]
    );
    assert.strictEqual(parseInt(result.rows[0].count), 3);
  });
});
