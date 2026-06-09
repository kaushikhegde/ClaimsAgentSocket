const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateClaim, sanitizeClaim } = require('../src/extraction/schema');
const { buildExtractionPrompt } = require('../src/extraction/prompts');

describe('Extraction Schema', () => {
  it('should validate a correct claim', () => {
    const claim = {
      claimType: 'auto_accident',
      status: 'complete',
      missingFields: [],
      claimant: { fullName: 'John Doe', phone: '555-0100', email: 'john@test.com', policyNumber: 'P123' },
      incident: { date: '2026-03-15', location: '123 Main St', description: 'Rear-ended', severity: 'moderate' },
      details: { vehicleInfo: { make: 'Toyota', model: 'Camry', year: 2024 } },
      witnesses: [],
      medicalProvider: { name: null, contact: null },
      additionalNotes: '',
    };
    const { valid, errors } = validateClaim(claim);
    assert.strictEqual(valid, true);
    assert.strictEqual(errors.length, 0);
  });

  it('should reject invalid claimType', () => {
    const claim = { claimType: 'fire', status: 'complete', incident: { description: 'test' } };
    const { valid } = validateClaim(claim);
    assert.strictEqual(valid, false);
  });

  it('should reject invalid severity', () => {
    const claim = { claimType: 'auto_accident', status: 'complete', incident: { description: 'test', severity: 'extreme' } };
    const { valid } = validateClaim(claim);
    assert.strictEqual(valid, false);
  });

  it('should reject missing incident description', () => {
    const claim = { claimType: 'auto_accident', status: 'complete', incident: {} };
    const { valid, errors } = validateClaim(claim);
    assert.strictEqual(valid, false);
    assert.ok(errors.some(e => e.includes('description')));
  });
});

describe('Sanitize Claim', () => {
  it('should fix invalid claimType to general_injury', () => {
    const claim = { claimType: 'fire', status: 'complete', incident: {} };
    const result = sanitizeClaim(claim);
    assert.strictEqual(result.claimType, 'general_injury');
  });

  it('should fix invalid status to needs_followup', () => {
    const claim = { claimType: 'auto_accident', status: 'unknown', incident: {} };
    const result = sanitizeClaim(claim);
    assert.strictEqual(result.status, 'needs_followup');
  });

  it('should nullify invalid severity', () => {
    const claim = { claimType: 'auto_accident', status: 'complete', incident: { severity: 'extreme' } };
    const result = sanitizeClaim(claim);
    assert.strictEqual(result.incident.severity, null);
  });

  it('should not change valid values', () => {
    const claim = { claimType: 'auto_accident', status: 'complete', incident: { severity: 'moderate' } };
    const result = sanitizeClaim(claim);
    assert.strictEqual(result.claimType, 'auto_accident');
    assert.strictEqual(result.status, 'complete');
    assert.strictEqual(result.incident.severity, 'moderate');
  });
});

describe('Extraction Prompt', () => {
  it('should include transcript in the prompt', () => {
    const prompt = buildExtractionPrompt('Agent: Hello\nUser: I had a car accident');
    assert.ok(prompt.includes('I had a car accident'));
    assert.ok(prompt.includes('auto_accident'));
  });

  it('should list all claim types', () => {
    const prompt = buildExtractionPrompt('test');
    assert.ok(prompt.includes('workplace_injury'));
    assert.ok(prompt.includes('slip_and_fall'));
    assert.ok(prompt.includes('medical_malpractice'));
  });
});
