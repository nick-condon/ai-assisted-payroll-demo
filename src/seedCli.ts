import { createPool } from './db/pool.js';
import { seedDemoData } from './seed.js';

const pool = createPool();
const reset = process.argv.includes('--reset');

seedDemoData(pool, { reset })
  .then(async (result) => {
    console.log(result === 'skipped' ? 'Demo data already present' : 'Demo data ready');
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
