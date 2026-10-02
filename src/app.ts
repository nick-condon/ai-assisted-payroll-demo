import path from 'node:path';
import express, { type Express } from 'express';
import type pg from 'pg';
import { employeeRouter } from './routes/employees.js';
import { payrollRouter } from './routes/payroll.js';
import { payslipRouter } from './routes/payslips.js';
import { sessionRouter } from './routes/session.js';

export function createApp(db: pg.Pool): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', sessionRouter(db));
  app.use('/api', employeeRouter(db));
  app.use('/api', payrollRouter(db));
  app.use('/api', payslipRouter(db));

  app.use(express.static(path.join(process.cwd(), 'public')));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
