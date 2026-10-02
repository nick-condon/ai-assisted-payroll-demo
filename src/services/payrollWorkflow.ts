import type pg from 'pg';
import { calculatePayslip } from './payrollCalculator.js';

export class WorkflowError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'WorkflowError';
    this.status = status;
  }
}

type RunRow = {
  id: string;
  status: string;
  period_start: string;
  period_end: string;
};

async function requireRun(db: pg.Pool, payrollRunId: string): Promise<RunRow> {
  const result = await db.query(
    `
      SELECT id, status, period_start, period_end
      FROM payroll_runs
      WHERE id = $1
    `,
    [payrollRunId]
  );
  const row = result.rows[0];
  if (!row) throw new WorkflowError(404, 'Payroll run not found');
  return {
    id: String(row.id),
    status: String(row.status),
    period_start: String(row.period_start),
    period_end: String(row.period_end)
  };
}

function assertOpen(run: RunRow): void {
  if (run.status === 'closed') {
    throw new WorkflowError(409, 'Closed payroll cannot be modified');
  }
}

export async function generateDraftPayslips(db: pg.Pool, payrollRunId: string): Promise<number> {
  const run = await requireRun(db, payrollRunId);
  assertOpen(run);

  const existing = await db.query(
    'SELECT 1 FROM payslips WHERE payroll_run_id = $1 LIMIT 1',
    [run.id]
  );
  if (existing.rowCount) {
    throw new WorkflowError(409, 'Payslips already exist for this payroll run');
  }

  const employees = await db.query(
    `
      SELECT id, annual_salary
      FROM employees
      WHERE active = TRUE
      ORDER BY employee_number
    `
  );
  if (!employees.rowCount) {
    throw new WorkflowError(409, 'No active employees to pay');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const employee of employees.rows) {
      const leave = await client.query(
        `
          SELECT COALESCE(SUM(days), 0) AS days
          FROM leave_entries
          WHERE employee_id = $1
            AND leave_type = 'unpaid'
            AND leave_date >= $2::date
            AND leave_date <= $3::date
        `,
        [employee.id, run.period_start, run.period_end]
      );
      const allowance = await client.query(
        `
          SELECT COALESCE(SUM(amount), 0) AS amount
          FROM allowances
          WHERE employee_id = $1
            AND payroll_run_id = $2
        `,
        [employee.id, run.id]
      );
      const calculated = calculatePayslip({
        annualSalary: Number(employee.annual_salary),
        unpaidLeaveDays: Number(leave.rows[0].days),
        allowanceAmount: Number(allowance.rows[0].amount)
      });
      await client.query(
        `
          INSERT INTO payslips (
            payroll_run_id, employee_id, gross_pay, leave_deduction, allowances, net_pay, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'draft')
        `,
        [
          run.id,
          employee.id,
          calculated.grossPay,
          calculated.leaveDeduction,
          calculated.allowances,
          calculated.netPay
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return employees.rowCount ?? 0;
}

export async function finalisePayslip(db: pg.Pool, payslipId: string): Promise<void> {
  const found = await db.query(
    `
      SELECT p.id, p.status AS payslip_status, r.status AS run_status
      FROM payslips p
      JOIN payroll_runs r ON r.id = p.payroll_run_id
      WHERE p.id = $1
    `,
    [payslipId]
  );
  const row = found.rows[0];
  if (!row) throw new WorkflowError(404, 'Payslip not found');
  if (row.run_status === 'closed') {
    throw new WorkflowError(409, 'Closed payroll cannot be modified');
  }
  if (row.payslip_status === 'final') {
    throw new WorkflowError(409, 'Payslip is already final');
  }

  const updated = await db.query(
    `
      UPDATE payslips
      SET status = 'final', finalised_at = now()
      WHERE id = $1
        AND status = 'draft'
    `,
    [payslipId]
  );
  if (!updated.rowCount) {
    throw new WorkflowError(409, 'Payslip is already final');
  }
}

export async function closePayrollRun(db: pg.Pool, payrollRunId: string): Promise<void> {
  const run = await requireRun(db, payrollRunId);
  if (run.status === 'closed') {
    throw new WorkflowError(409, 'Payroll run is already closed');
  }

  const counts = await db.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
      FROM payslips
      WHERE payroll_run_id = $1
    `,
    [run.id]
  );
  const total = Number(counts.rows[0].total);
  const drafts = Number(counts.rows[0].drafts);
  if (total === 0) {
    throw new WorkflowError(409, 'Generate payslips before closing this payroll run');
  }
  if (drafts > 0) {
    throw new WorkflowError(409, 'Payroll cannot be closed while a payslip is still draft');
  }

  const updated = await db.query(
    `
      UPDATE payroll_runs
      SET status = 'closed', closed_at = now()
      WHERE id = $1
        AND status = 'open'
    `,
    [run.id]
  );
  if (!updated.rowCount) {
    throw new WorkflowError(409, 'Payroll run is already closed');
  }
}
