// Postgres connection pool for the hive brain.
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '[db] DATABASE_URL is not set. Set it on the Railway service to ' +
      '${{Postgres.DATABASE_URL}} so the brain can connect.'
  );
}

// Railway's internal Postgres connection does not need SSL. If you ever point
// DATABASE_URL at a public host that requires it, set PGSSL=require.
const ssl =
  process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false;

export const pool = new Pool({
  connectionString,
  ssl,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5,
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err.message);
});

/** Run a query. Returns the pg result. */
export const query = (text, params) => pool.query(text, params);

/** True once we can reach the database. */
export async function ping() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}
