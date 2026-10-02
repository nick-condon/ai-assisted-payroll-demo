# Architecture

A single Node process serves a static page and a JSON API. PostgreSQL holds users, roles, employees, and the payroll run.

## System context

```text
[Browser]
    |
    v
[Express / TypeScript API]
    |
    +--> [Authentication / Sessions]
    |
    +--> [RBAC / Authorization]
    |
    +--> [Payroll Services]
    |
    v
[PostgreSQL]
```

The browser is `public/index.html`, `public/app.js`, and `public/styles.css`. There is no frontend build step. Express serves those files and the `/api` routes from `src/app.ts`.

Payroll arithmetic lives in `src/services/payrollCalculator.ts`. Run transitions live in `src/services/payrollWorkflow.ts`. Routes call those functions after the auth middleware.

## Request flow

`POST /api/payroll-runs/:id/generate` is representative.

1. The request arrives at `payrollRouter` in `src/routes/payroll.ts`.
2. `requireAuth` reads the `demo_session` cookie, hashes the token, and loads the user from `sessions` joined to `users` and `user_roles`. A missing or expired session returns 401.
3. `requireRole('payroll_processor')` checks the roles just loaded from the database. Any other role returns 403. The request body is not consulted for a role.
4. `generateDraftPayslips` loads the payroll run. A closed run returns 409. If payslips already exist, it returns 409. Otherwise it inserts one `draft` payslip per active employee, using unpaid leave days inside the period and allowances for that run.
5. PostgreSQL commits those inserts.
6. The route returns 201 and `{ "created": <count> }`.

Finalise and close follow the same shape: session, role, then `finalisePayslip` or `closePayrollRun`.

## Data model

| Entity | Role in the demo |
| --- | --- |
| `users` | Fictional people who can sign in. |
| `roles` | `payroll_viewer`, `payroll_processor`, `payroll_closer`. |
| `user_roles` | Which user has which role. The seed assigns one role each. |
| `employees` | People being paid. They are not login accounts. |
| `payroll_runs` | One fortnight, `open` or `closed`. |
| `leave_entries` | Unpaid leave days, linked to an employee. |
| `allowances` | A flat amount for one employee on one run. |
| `payslips` | One row per employee per run: gross, leave deduction, allowances, net, `draft` or `final`. |
| `sessions` | Hash of the opaque cookie token, user id, and expiry. |

A payslip belongs to one run and one employee. Leave belongs to an employee and is counted when its date falls inside the run. An allowance belongs to both an employee and a run. A session belongs to a user. Roles are reached only through `user_roles`.

## State model

```text
Open
  |
  v
Generate payslips
  |
  v
Draft payslips
  |
  v
Finalised payslips
  |
  v
Closed payroll run
```

Constraints enforced by the API:

- Only `payroll_processor` can generate or finalise.
- Generate runs once. A second generate on the same run returns 409.
- Finalise changes one `draft` payslip to `final`. An already final payslip returns 409.
- Only `payroll_closer` can close. A processor receives 403 even after every payslip is final, because the role check runs before the workflow check.
- Close returns 409 while any payslip is still `draft`, and when the run has no payslips yet.
- A closed run rejects generate and finalise with 409. Closing it again returns 409.
