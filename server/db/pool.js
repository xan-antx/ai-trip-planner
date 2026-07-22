import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy server/.env.example to server/.env');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Unexpected Postgres client error', err);
});

/** Run a parameterised query against the shared pool. */
export const query = (text, params) => pool.query(text, params);

export default pool;
