import type pg from 'pg';

const DEMO_USERS = [
  {
    email: 'viewer@example.com',
    displayName: 'Avery Brooks',
    role: 'payroll_viewer'
  },
  {
    email: 'processor@example.com',
    displayName: 'Riley Quinn',
    role: 'payroll_processor'
  },
  {
    email: 'closer@example.com',
    displayName: 'Jordan Hale',
    role: 'payroll_closer'
  }
] as const;

const EMPLOYEES = [
  ['E-1001', 'Alex', 'Morgan', 'alex.morgan@example.com', 1000],
  ['E-1002', 'Jamie', 'Lee', 'jamie.lee@example.com', 2000],
  ['E-1003', 'Taylor', 'Chen', 'taylor.chen@example.com', 3000],
  ['E-1004', 'Sam', 'Rivera', 'sam.rivera@example.com', 2000],
  ['E-1005', 'Casey', 'Patel', 'casey.patel@example.com', 1000]
] as const;

export async function resetDemoTables(db: pg.Pool): Promise<void> {
  await db.query(`
    TRUNCATE TABLE
      sessions,
      payslips,
      allowances,
      leave_entries,
      payroll_runs,
      employees,
      user_roles,
      users,
      roles
    RESTART IDENTITY CASCADE
  `);
  await db.query(`
    INSERT INTO roles (code, name)
    VALUES
      ('payroll_viewer', 'Payroll viewer'),
      ('payroll_processor', 'Payroll processor'),
      ('payroll_closer', 'Payroll closer')
  `);
}

export async function seedDemoData(db: pg.Pool, options: { reset?: boolean } = {}): Promise<'seeded' | 'skipped'> {
  if (options.reset) {
    await resetDemoTables(db);
  } else {
    const existing = await db.query(
      `SELECT 1 FROM users WHERE email = 'viewer@example.com'`
    );
    if (existing.rowCount) return 'skipped';
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    for (const user of DEMO_USERS) {
      const inserted = await client.query(
        `
          INSERT INTO users (email, display_name)
          VALUES ($1, $2)
          ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
          RETURNING id
        `,
        [user.email, user.displayName]
      );
      await client.query(
        `
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, id FROM roles WHERE code = $2
          ON CONFLICT DO NOTHING
        `,
        [inserted.rows[0].id, user.role]
      );
    }

    for (const [number, first, last, email, salary] of EMPLOYEES) {
      await client.query(
        `
          INSERT INTO employees (employee_number, first_name, last_name, email, annual_salary)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (employee_number) DO UPDATE
            SET first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                email = EXCLUDED.email,
                annual_salary = EXCLUDED.annual_salary
          RETURNING id
        `,
        [number, first, last, email, salary]
      );
    }

    const run = await client.query(
      `
        INSERT INTO payroll_runs (period_start, period_end, pay_date, status)
        VALUES ('2026-06-01', '2026-06-14', '2026-06-14', 'open')
        ON CONFLICT (period_start, period_end, pay_date) DO UPDATE SET status = payroll_runs.status
        RETURNING id
      `
    );
    const runId = String(run.rows[0].id);

    await client.query(
      `
        INSERT INTO leave_entries (employee_id, leave_date, days, leave_type)
        SELECT id, '2026-06-03'::date, 2, 'unpaid'
        FROM employees WHERE employee_number = 'E-1001'
        AND NOT EXISTS (
          SELECT 1 FROM leave_entries
          WHERE employee_id = employees.id AND leave_date = '2026-06-03'
        )
      `
    );
    await client.query(
      `
        INSERT INTO leave_entries (employee_id, leave_date, days, leave_type)
        SELECT id, '2026-06-08'::date, 1, 'unpaid'
        FROM employees WHERE employee_number = 'E-1002'
        AND NOT EXISTS (
          SELECT 1 FROM leave_entries
          WHERE employee_id = employees.id AND leave_date = '2026-06-08'
        )
      `
    );

    await client.query(
      `
        INSERT INTO allowances (employee_id, payroll_run_id, description, amount)
        SELECT e.id, $1, 'Training stipend', 50
        FROM employees e
        WHERE e.employee_number = 'E-1003'
          AND NOT EXISTS (
            SELECT 1 FROM allowances a
            WHERE a.employee_id = e.id AND a.payroll_run_id = $1 AND a.description = 'Training stipend'
          )
      `,
      [runId]
    );
    await client.query(
      `
        INSERT INTO allowances (employee_id, payroll_run_id, description, amount)
        SELECT e.id, $1, 'Demo allowance', 25
        FROM employees e
        WHERE e.employee_number = 'E-1004'
          AND NOT EXISTS (
            SELECT 1 FROM allowances a
            WHERE a.employee_id = e.id AND a.payroll_run_id = $1 AND a.description = 'Demo allowance'
          )
      `,
      [runId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return 'seeded';
}
