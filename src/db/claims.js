const pool = require('./pool');

async function insertClaim(claimData, client) {
  const db = client || pool;
  const {
    claimType, status, claimant, incident,
    details, witnesses, medicalProvider,
    additionalNotes, missingFields,
  } = claimData;

  const result = await db.query(
    `INSERT INTO claims (
      claim_type, status, claimant_name, claimant_phone, claimant_email,
      policy_number, incident_date, incident_location, incident_description,
      severity, type_specific_details, witnesses, medical_provider,
      additional_notes, missing_fields
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING id, created_at`,
    [
      claimType,
      status,
      claimant?.fullName || null,
      claimant?.phone || null,
      claimant?.email || null,
      claimant?.policyNumber || null,
      incident?.date || null,
      incident?.location || null,
      incident?.description || null,
      incident?.severity || null,
      JSON.stringify(details || {}),
      JSON.stringify(witnesses || []),
      JSON.stringify(medicalProvider || {}),
      additionalNotes || null,
      JSON.stringify(missingFields || []),
    ]
  );

  return result.rows[0];
}

async function getClaimById(id) {
  const result = await pool.query('SELECT * FROM claims WHERE id = $1', [id]);
  return result.rows[0] || null;
}

module.exports = { insertClaim, getClaimById };
