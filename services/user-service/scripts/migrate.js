/**
 * Applies db/init.sql against DATABASE_URL. Safe to run multiple times
 * (schema uses CREATE TABLE IF NOT EXISTS / CREATE EXTENSION IF NOT EXISTS).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const sqlPath = path.resolve(__dirname, '../../../db/init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log(`Applying schema from ${sqlPath} ...`);
    await pool.query(sql);
    console.log('Schema applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
