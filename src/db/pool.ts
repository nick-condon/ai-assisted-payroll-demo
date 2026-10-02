import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool, types } = pg;

// Keep DATE columns as YYYY-MM-DD strings.
types.setTypeParser(1082, (value: string) => value);

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  }
  return new Pool({ connectionString, max: 5 });
}
