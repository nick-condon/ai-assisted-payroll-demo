# Synthetic payroll demo

This repository is a small, working payroll workflow built as an engineering demonstration. It takes one business process from an empty database to a browser a reviewer can click through: an open fortnight, draft payslips, finalisation, and a separate close step.

It is a vertical slice, not a payroll product. The point is to show requirements, architecture, authorisation, tests, and a runnable application in one place.

It is not a production payroll system. Every employee, sign-in identity, salary, allowance, and leave day in this repository is fictional.

## Problem

A payroll period should not be prepared and closed by the same unchecked action, and an employee should see only their own pay.

The demo models that split:

- Employees belong to a pay run.
- A processor generates draft payslips from a toy formula, including one unpaid-leave deduction and simple allowances.
- The processor finalises each payslip.
- A different role, the closer, closes the run, and only after every payslip is final.
- A viewer can read the result and cannot change it.
- After close, the run is immutable.
- An employee sign-in can read that person's own profile and payslips. It cannot run payroll, and it cannot read another employee's payslip.

## Architecture

```text
Browser (HTML, CSS, plain JavaScript)
        |
        v
Express / TypeScript API
        |
        +--> server-side sessions
        +--> role checks
        +--> record-level employee scope
        +--> payroll services
        |
        v
PostgreSQL 16
```

What is actually in the repository:

- An HttpOnly session cookie. The server stores only a hash of the token and loads the user's roles, and any linked employee, from PostgreSQL on each request.
- Role checks on the API. Hiding a button is not the authorisation control.
- Record-level checks for employee self-service. `/api/my/...` uses the employee id stored on the user, not an id chosen in the browser.
- SQL migrations under `src/db/migrations`, applied by `npm run migrate`.
- A small REST API. The route table is in [Security / authorization](#security--authorization).
- Docker Compose for PostgreSQL 16 and the Node 22 application image.
- Jest tests for the formula, role checks, record-level payslip access, and the close rules.

There is no frontend framework, no OAuth client, and no production deployment in this repository.

Further detail: [ARCHITECTURE.md](ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md).

## Key engineering decisions

| Decision | Reason |
| --- | --- |
| TypeScript | Type safety and maintainability |
| Express | Small, explicit HTTP service |
| PostgreSQL | Relational model appropriate for payroll-style transactional data |
| Server-side sessions | Simple demo authentication model with server-controlled session state |
| Server-side RBAC | Authorization must not depend on UI controls |
| Server-side record scope | An employee payslip query uses the employee id stored for that session |
| SQL migrations | Reproducible database setup |
| Docker Compose | Repeatable local environment |
| Small vertical slice | Demonstrates complete delivery without unnecessary product complexity |

Judgement and trade-offs: [DECISIONS.md](DECISIONS.md).

## Security / authorization

Sign-in is a development identity picker. The browser sends a user id. It does not send a role. `requireAuth` resolves the `demo_session` cookie to a database user. `requireRole` then allows the request only when that user's stored role is in the allowed list.

This is deliberately simplified for a public demo. It is not production-grade identity management. A production system of this kind would use an identity provider. See [PRODUCTION-VS-DEMO.md](PRODUCTION-VS-DEMO.md).

| Situation | Response |
| --- | --- |
| No session on a protected route | 401 |
| Signed in, role not allowed | 403 |
| Business rule failed (for example, drafts remain, or the run is already closed) | 409 |

Protected routes deny by default: authentication is required, and the role list is explicit. Unknown API paths return 404.

| Role | Read employees, runs, and payslips | Generate and finalise | Close | Own payslips only |
| --- | --- | --- | --- | --- |
| Payroll viewer | Yes | No | No | No |
| Payroll processor | Yes | Yes | No | No |
| Payroll closer | Yes | No | Yes, once every payslip is final | No |
| Employee | No | No | No | Yes |

`GET /api/my/profile`, `GET /api/my/payslips`, and `GET /api/my/payslips/:id` require the `employee` role. The query is restricted to `users.employee_id` from the session. A payslip id that belongs to someone else returns 404, the same response as an unknown id, so the API does not confirm that the other payslip exists.

A closed run rejects generate and finalise. The service returns 409 with `Closed payroll cannot be modified`.

Toy formula, rounded to cents:

```text
fortnightly base pay = annual salary / 26
daily rate           = annual salary / 260
leave deduction      = daily rate × unpaid days in the period
net pay              = fortnightly base pay − leave deduction + allowances
```

Seed salaries are 1000, 2000, and 3000 so the amounts stay obviously fictional.

## Testing

Jest with ts-jest. Eighteen tests, in two files:

- `tests/payrollCalculator.test.ts` — fortnightly base, unpaid leave, allowance, and cent rounding.
- `tests/api.test.ts` — unauthenticated reads return 401; a viewer can read; a viewer cannot generate (403); a processor cannot close (403); generate creates drafts; finalise sets `final`; close fails while a draft remains; the closer can close when all payslips are final; a closed run cannot be generated or finalised again; an employee can read their own profile, payslip list, and payslip; another employee's payslip returns 404; an employee cannot generate, finalise, or close.

No coverage percentage is claimed. API tests need the Compose database running. They use a separate database, `payroll_demo_test`, and reset it themselves.

## Running locally

Intended runtime: Node.js 22. That version is declared in `package.json` (`engines`), `.nvmrc`, and the Docker image `node:22-bookworm-slim`. PostgreSQL is 16, from Compose.

The repeatable path is Compose. It migrates, seeds, and serves the app.

```bash
docker compose up --build
```

Open http://127.0.0.1:3010

To run tests, or to work on the TypeScript directly, start only the database and use Node 22 on the host:

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run migrate
npm run seed
npm test
npm run build
npm run dev
```

`npm run dev` listens on port 3010. Reset the fictional data with `npm run seed:reset`.

The database password `demo_local_password` exists only in this local Compose file.

## Demo workflow

1. Sign in as Riley Quinn, payroll processor.
2. View the open payroll run (1–14 June 2026 in the seed data).
3. Generate payslips.
4. Finalise each payslip.
5. Choose **Close payroll**. The server returns 403.
6. Sign out. Sign in as Jordan Hale, payroll closer.
7. Close the payroll run.
8. Sign out. Sign in as Avery Brooks, payroll viewer.
9. Observe the closed, read-only run. Generate stays unavailable.
10. Sign in as **Employee — Alex Morgan**. The page shows Alex's profile and Alex's payslip only.
11. Jamie Lee's payslip is not in that response. Requesting Jamie's payslip id as Alex returns 404. The five-minute script is [DEMO.md](DEMO.md).

## Production relationship

This demo is intentionally separate from the production payroll system. It is a synthetic representation of selected engineering concepts from a real production project.

The author designed and deployed that production system for a school. It supports approximately 125 employees, four administrative users, and around 50 employee self-service users. That system has a wider workflow, operational controls, and a real identity provider. This repository keeps only a fictional slice that can be shown in public: relational payroll state, server-side authorisation, a simplified employee view of one's own payslip, tests, and a runnable UI.

The employee page in this demo is not the production self-service portal.

Nothing here is copied from the production codebase. Comparison: [PRODUCTION-VS-DEMO.md](PRODUCTION-VS-DEMO.md).

## AI-assisted development

The project was implemented with AI-assisted coding. The human developer owned the problem, the workflow, the scope, the architecture, the technical choices, the authorisation model, the database shape, the testing strategy, review, and acceptance.

AI tooling was used to draft and revise implementation code, tests, and documentation inside those decisions. It did not independently design or deliver the system. Detail: [AI-DEVELOPMENT.md](AI-DEVELOPMENT.md).
