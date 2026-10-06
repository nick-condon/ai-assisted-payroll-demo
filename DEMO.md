# Five-minute demo

A short script for a technical interview. The app is at http://127.0.0.1:3010 after `docker compose up --build`. Start from a fresh seed (`npm run seed:reset`, or the first Compose boot) so the fortnight is open and no payslips exist yet.

All names and amounts below are fictional.

## 0:00–0:30 — Context

"I designed and deployed a production payroll system used by a school. The production application and data are private, so this repository is a deliberately simplified synthetic vertical slice demonstrating the engineering approach."

Point at the page banner: synthetic demo, fictional data, and demo login rather than production identity.

## 0:30–1:30 — Payroll processor

Sign in as **Riley Quinn**.

Show the open run (1–14 June 2026), the five fictional employees, and the toy formula on the page.

Choose **Generate draft payslips**. Then **Finalise** each row.

Say that those actions are API calls. The page does not calculate pay and does not decide that a payslip may be finalised.

## 1:30–2:00 — Separation of duties

Still as Riley, choose **Close payroll**.

The banner should report 403. The run stays open.

"The UI is not the security boundary. The API independently enforces authorization."

## 2:00–2:30 — Payroll closer

Sign out. Sign in as **Jordan Hale**.

Generate and finalise are not available. Choose **Close payroll**.

The status becomes closed. Say that generate and finalise now fail on the server as well, because a closed run is immutable.

## 2:30–3:30 — Employee self-service

Sign out. Sign in as **Employee — Alex Morgan**.

Show Alex's profile, the one payslip, and the payslip lines: gross, unpaid leave, resulting pay, status. There is no generate, finalise, or close control.

"Role authorization controls what operations a user may perform. Record-level authorization controls which employee-specific data they may access."

To show the record check directly, use the API. Replace the ids from the first two responses.

```bash
curl -s http://127.0.0.1:3010/api/demo-users
```

Log in as Alex (`alex.employee@example.com`) and as Jamie (`jamie.employee@example.com`) by posting each user's `id`:

```bash
curl -s -c /tmp/alex.txt -H 'content-type: application/json' \
  -d '{"userId":"<alex-user-id>"}' \
  http://127.0.0.1:3010/api/login

curl -s -b /tmp/alex.txt http://127.0.0.1:3010/api/my/payslips
```

Note Alex's payslip `id`. Then:

```bash
curl -s -c /tmp/jamie.txt -H 'content-type: application/json' \
  -d '{"userId":"<jamie-user-id>"}' \
  http://127.0.0.1:3010/api/login

curl -s -b /tmp/jamie.txt \
  http://127.0.0.1:3010/api/my/payslips/<alex-payslip-id>
```

That last call returns 404. Jamie's own payslip id returns 200. The server applies `users.employee_id` from the session. The browser does not send the employee id.

## 3:30–4:30 — Tests

From the repository, after `npm install`, with the Compose database running and Node.js 22 on the host:

```bash
npm test
```

Point out the groups:

- payroll calculation
- workflow and closed-run immutability
- role authorization, including processor close returning 403
- employee own-record access
- cross-employee access denied with 404

## 4:30–5:00 — Architecture and AI-assisted development

Open `ARCHITECTURE.md` and show the two checks: role, then the employee id on the session.

Open `AI-DEVELOPMENT.md`. The developer owned the workflow, the role split, the employee link, and acceptance. AI-assisted tooling was used to implement and revise code inside those decisions.
