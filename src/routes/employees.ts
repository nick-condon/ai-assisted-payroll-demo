import { Router } from 'express';
import type pg from 'pg';
import { requireAuth, requireRole } from '../middleware/auth.js';

export function employeeRouter(db: pg.Pool): Router {
  const router = Router();

  router.get(
    '/employees',
    requireAuth(db),
    requireRole('payroll_viewer', 'payroll_processor', 'payroll_closer'),
    async (_req, res) => {
      const result = await db.query(
        `
          SELECT id, employee_number, first_name, last_name, email, annual_salary, active
          FROM employees
          ORDER BY employee_number
        `
      );
      return res.json({
        employees: result.rows.map((row) => ({
          id: String(row.id),
          employeeNumber: String(row.employee_number),
          firstName: String(row.first_name),
          lastName: String(row.last_name),
          email: String(row.email),
          annualSalary: Number(row.annual_salary),
          active: Boolean(row.active)
        }))
      });
    }
  );

  return router;
}
