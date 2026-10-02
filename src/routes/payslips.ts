import { Router } from 'express';
import type pg from 'pg';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { finalisePayslip, WorkflowError } from '../services/payrollWorkflow.js';

export function payslipRouter(db: pg.Pool): Router {
  const router = Router();

  router.post(
    '/payslips/:id/finalise',
    requireAuth(db),
    requireRole('payroll_processor'),
    async (req, res) => {
      try {
        await finalisePayslip(db, String(req.params.id));
        return res.json({ status: 'final' });
      } catch (error) {
        if (error instanceof WorkflowError) {
          return res.status(error.status).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}
