import { createPool } from './db/pool.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3010);
const pool = createPool();
const app = createApp(pool);

app.listen(port, '0.0.0.0', () => {
  console.log(`Payroll demo listening on ${port}`);
});
