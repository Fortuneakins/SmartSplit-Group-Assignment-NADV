const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Unexpected error on idle client - log and let the process supervisor restart if needed
  console.error('[settlement-service] Unexpected DB pool error', err);
});

module.exports = pool;
