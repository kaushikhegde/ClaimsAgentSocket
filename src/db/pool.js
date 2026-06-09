const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

// Azure Database for PostgreSQL requires SSL/TLS. Enable it automatically when
// the connection points at Azure (or when DATABASE_SSL=true is set explicitly).
// rejectUnauthorized:false keeps traffic encrypted without bundling Azure's CA;
// to also verify the server identity, set DATABASE_SSL=verify and supply the CA.
const sslMode = process.env.DATABASE_SSL;
const isAzure = /\.azure\.com/i.test(config.databaseUrl || '');
let ssl = false;
if (sslMode === 'verify') {
  ssl = { rejectUnauthorized: true };
} else if (sslMode === 'true' || (sslMode !== 'false' && isAzure)) {
  ssl = { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error:', err.message);
});

module.exports = pool;
