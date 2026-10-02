# Technical decisions

These are the choices that shape this repository. They are sized for a demonstration, not for a full payroll product.

### Decision: Small vertical slice

**Context**

A payroll system can grow into tax, payments, leave policy, and employee self-service. A reviewer cannot usefully read all of that in one sitting.

**Decision**

Ship one fortnight, five fictional employees, draft payslips, finalise, a separate close, and a read-only self-service view for two of those employees.

**Why**

The slice still crosses the whole path: UI, API, rules, database, and tests. The separation between processor and closer is visible without extra modules.

**Trade-off**

The demo does not show reporting, document generation, or a real pay calculation. The employee view is one person's profile and payslips, not a full self-service product.

### Decision: TypeScript and Express

**Context**

The service is small, but the request path should stay explicit: route, middleware, service, SQL.

**Decision**

TypeScript on Node.js 22, with Express 4 and no frontend framework. The page is static HTML, CSS, and browser JavaScript served by the same process.

**Why**

Types document the payslip result and the workflow errors. Express keeps routing obvious. A framework would hide a UI that is only one page.

**Trade-off**

There is no shared client/server type generation, and the page does not have a component model.

### Decision: PostgreSQL

**Context**

Payroll state is relational: a run has many payslips, a payslip belongs to one employee, and a user has roles.

**Decision**

PostgreSQL 16, accessed with `pg` and parameterised queries.

**Why**

Foreign keys and unique constraints match the model (one payslip per employee per run, one row per period). Transactions wrap payslip generation.

**Trade-off**

Local setup needs a database process. Compose provides it. There is no ORM, so SQL is written by hand.

### Decision: Server-side sessions for demo login

**Context**

The public demo cannot depend on a real identity provider, and the browser must not be trusted to assert a role.

**Decision**

A sign-in picker posts a user id. The server creates a random token, stores its SHA-256 hash on `sessions`, and sets an HttpOnly `SameSite=Lax` cookie. Each request reloads roles from the database.

**Why**

The session is server-controlled and easy to explain. Logout deletes the row. The cookie is not a permission token.

**Trade-off**

Anyone who can open the app can choose a demo user. That is acceptable only because the data is fictional. It is not an identity system.

### Decision: Server-side role checks

**Context**

The UI disables Generate for some roles. A disabled button is not a security boundary.

**Decision**

`requireAuth` then `requireRole` on each protected route. Viewer, processor, closer, and employee are four role codes. Close is not granted to the processor. The employee role is not granted generate, finalise, or close.

**Why**

The interesting rule is separation of duties. Tests call the API directly and expect 403, so the check cannot live only in JavaScript.

**Trade-off**

There is no finer permission catalogue, no delegation UI, and no audit log of who closed a run beyond `closed_at` on the payroll row.

### Decision: Plain SQL migrations

**Context**

The schema has to be recreated the same way on a new machine and inside the app container.

**Decision**

Numbered SQL files under `src/db/migrations`, applied by `src/db/migrate.ts`, which records filenames in `schema_migrations`. `002_employee_self_service.sql` adds the employee role and `users.employee_id`.

**Why**

One file is enough for this schema, and the SQL is the source of truth. The container runs the same compiled migrator before it listens.

**Trade-off**

There is no down migration. Resetting demo rows is a separate seed command, not a schema rollback.

### Decision: Docker Compose for the local stack

**Context**

A reviewer should start the database and the app without installing PostgreSQL by hand.

**Decision**

Compose runs Postgres 16 and a Node 22 image. The image builds TypeScript, then the container migrates, seeds, and starts the server. The host port is 3010.

**Why**

The image matches the declared Node version. Migrations are not left as a manual surprise on first boot of the full stack.

**Trade-off**

Tests still run on the host, against the published database port, because Jest is not part of the container command. The database password is a local default committed in the Compose file.

### Decision: Jest around rules and transitions

**Context**

The formula and the close gate are the behaviours most likely to break quietly.

**Decision**

Unit tests call `calculatePayslip` directly. API tests boot the Express app against `payroll_demo_test`, seed fictional rows, and assert status codes.

**Why**

The calculator tests do not need a browser. The API tests prove that role checks run on the server and that a closed run stays closed.

**Trade-off**

There is no browser automation in `npm test`, and no coverage target. The click-through is manual.

### Decision: Record-level employee access

**Context**

Employee payroll information is sensitive and must be isolated between users. A role of "employee" only says that this person may open self-service. It does not say which payslips they may read. Hiding another employee's row in the page would not stop a direct request.

**Decision**

Store `users.employee_id` and resolve it on the server when the session is loaded. `GET /api/my/profile`, `GET /api/my/payslips`, and `GET /api/my/payslips/:id` query with that id. The path may contain a payslip id. It may not choose the employee. A payslip outside that scope returns 404, the same as an unknown id.

**Why**

The browser is not the authorization boundary. Tests sign in as Alex Morgan and request Jamie Lee's payslip id. The server denies it. Email addresses are not compared, so a shared or similar address cannot grant access.

**Trade-off**

The demo uses a single nullable foreign key from user to employee. It does not model an identity lifecycle, account recovery, or a person with more than one employee record. The 404 also means a client cannot distinguish "missing" from "someone else's", which is the intended privacy trade-off for this demo.
