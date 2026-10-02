import { Router } from 'express';
import type { Response } from 'express';
import type pg from 'pg';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

function money(value: unknown): number {
  return Number(value);
}

/**
 * The employee id comes from the session user loaded in requireAuth.
 * Query parameters and the request body are not used to choose an employee.
 */
function linkedEmployeeId(req: AuthedRequest, res: Response): string | undefined {
  const employeeId = req.user?.employeeId;
  if (!employeeId) {
    res.status(403).json({ error: 'Forbidden' });
    return undefined;
  }
  return employeeId;
}

type PayslipRow = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  gross_pay: string;
  leave_deduction: string;
  allowances: string;
  net_pay: string;
  status: string;
};

function presentPayslip(row: PayslipRow) {
  return {
    id: String(row.id),
    employeeNumber: String(row.employee_number),
    employeeName: `${row.first_name} ${row.last_name}`,
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    payDate: String(row.pay_date),
    grossPay: money(row.gross_pay),
    leaveDeduction: money(row.leave_deduction),
    allowances: money(row.allowances),
    netPay: money(row.net_pay),
    status: String(row.status)
  };
}

const PAYSLIP_SELECT = `
  SELECT
    p.id,
    e.employee_number,
    e.first_name,
    e.last_name,
    r.period_start,
    r.period_end,
    r.pay_date,
    p.gross_pay,
    p.leave_deduction,
    p.allowances,
    p.net_pay,
    p.status
  FROM payslips p
  JOIN employees e ON e.id = p.employee_id
  JOIN payroll_runs r ON r.id = p.payroll_run_id
`;

export function selfServiceRouter(db: pg.Pool): Router {
  const router = Router();
  const employeeOnly = [requireAuth(db), requireRole('employee')] as const;

  router.get('/my/profile', ...employeeOnly, async (req: AuthedRequest, res) => {
    const employeeId = linkedEmployeeId(req, res);
    if (!employeeId) return;

    const result = await db.query(
      `
        SELECT employee_number, first_name, last_name, email, annual_salary
        FROM employees
        WHERE id = $1
      `,
      [employeeId]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({
      profile: {
        employeeNumber: String(row.employee_number),
        firstName: String(row.first_name),
        lastName: String(row.last_name),
        email: String(row.email),
        annualSalary: money(row.annual_salary)
      }
    });
  });

  router.get('/my/payslips', ...employeeOnly, async (req: AuthedRequest, res) => {
    const employeeId = linkedEmployeeId(req, res);
    if (!employeeId) return;

    const result = await db.query(
      `
        ${PAYSLIP_SELECT}
        WHERE p.employee_id = $1
        ORDER BY r.period_start DESC, p.created_at DESC
      `,
      [employeeId]
    );
    return res.json({
      payslips: result.rows.map((row) => presentPayslip(row as PayslipRow))
    });
  });

  router.get('/my/payslips/:id', ...employeeOnly, async (req: AuthedRequest, res) => {
    const employeeId = linkedEmployeeId(req, res);
    if (!employeeId) return;

    // Scope the lookup to the session's employee. Another person's payslip
    // and an unknown id both return 404, so the response does not reveal
    // whether that id exists.
    const result = await db.query(
      `
        ${PAYSLIP_SELECT}
        WHERE p.id = $1
          AND p.employee_id = $2
      `,
      [req.params.id, employeeId]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ payslip: presentPayslip(row as PayslipRow) });
  });

  return router;
}
