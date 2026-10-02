import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';

const pool = createPool();

runMigrations(pool)
  .then(async (applied) => {
    if (applied.length === 0) {
      console.log('Migrations already applied');
    } else {
      console.log(`Applied: ${applied.join(', ')}`);
    }
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
