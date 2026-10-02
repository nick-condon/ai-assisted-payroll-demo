import { Router } from 'express';
import type pg from 'pg';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { closePayrollRun, generateDraftPayslips, WorkflowError } from '../services/payrollWorkflow.js';

function money(value: unknown): number {
  return Number(value);
}

async function sendWorkflow<T>(res: import('express').Response, work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof WorkflowError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export function payrollRouter(db: pg.Pool): Router {
  const router = Router();
  const authed = requireAuth(db);

  router.get('/payroll-runs', authed, requireRole('payroll_viewer', 'payroll_processor', 'payroll_closer'), async (_req, res) => {
    const result = await db.query(
      `
        SELECT id, period_start, period_end, pay_date, status, closed_at
        FROM payroll_runs
        ORDER BY period_start DESC, pay_date DESC
      `
    );
    return res.json({
      payrollRuns: result.rows.map((row) => ({
        id: String(row.id),
        periodStart: String(row.period_start),
        periodEnd: String(row.period_end),
        payDate: String(row.pay_date),
        status: String(row.status),
        closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null
      }))
    });
  });

  router.post('/payroll-runs/:id/generate', authed, requireRole('payroll_processor'), async (req, res) => {
    return sendWorkflow(res, async () => {
      const created = await generateDraftPayslips(db, String(req.params.id));
      return res.status(201).json({ created });
    });
  });

  router.get(
    '/payroll-runs/:id/payslips',
    authed,
    requireRole('payroll_viewer', 'payroll_processor', 'payroll_closer'),
    async (req, res) => {
      const result = await db.query(
        `
          SELECT
            p.id,
            p.employee_id,
            e.employee_number,
            e.first_name,
            e.last_name,
            p.gross_pay,
            p.leave_deduction,
            p.allowances,
            p.net_pay,
            p.status,
            p.finalised_at
          FROM payslips p
          JOIN employees e ON e.id = p.employee_id
          WHERE p.payroll_run_id = $1
          ORDER BY e.employee_number
        `,
        [req.params.id]
      );
      return res.json({
        payslips: result.rows.map((row) => ({
          id: String(row.id),
          employeeId: String(row.employee_id),
          employeeNumber: String(row.employee_number),
          employeeName: `${row.first_name} ${row.last_name}`,
          grossPay: money(row.gross_pay),
          leaveDeduction: money(row.leave_deduction),
          allowances: money(row.allowances),
          netPay: money(row.net_pay),
          status: String(row.status),
          finalisedAt: row.finalised_at ? new Date(row.finalised_at).toISOString() : null
        }))
      });
    }
  );

  router.post('/payroll-runs/:id/close', authed, requireRole('payroll_closer'), async (req: AuthedRequest, res) => {
    return sendWorkflow(res, async () => {
      await closePayrollRun(db, String(req.params.id));
      return res.json({ status: 'closed' });
    });
  });

  return router;
}
