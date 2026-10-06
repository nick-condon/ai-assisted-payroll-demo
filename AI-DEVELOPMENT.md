# How this demo was built

This note describes the working method for the fictional payroll demo. It does not include private prompts or production implementation detail.

## Human-owned work

The human developer owned:

- Problem definition: show a payroll close process without exposing a real payroll system.
- Requirements for this slice: five fictional employees, one fortnight, draft payslips, finalise, a separate close, and two employee sign-ins that can read only their own payslip.
- Workflow: who may prepare pay, who else must close it, and which employee record a self-service session may read.
- Scope: what to leave out, including tax, payments, and a real identity provider.
- Architecture: one Node process, SQL in PostgreSQL, server-side sessions, a static page.
- UI decisions: one page, a visible role, and a close button that calls the API even when the role will be refused.
- Database decisions: the tables in `src/db/migrations`, including `users.employee_id` as the ownership link.
- RBAC model: viewer, processor, closer, and employee, enforced with `requireAuth` and `requireRole`, plus payslip queries scoped to the session's employee id.
- Testing approach: formula tests plus API tests for 401, 403, the close gate, own-record access, and cross-employee denial.
- Review, validation, and acceptance of the resulting code.
- Deployment approach: this demo runs locally with Docker Compose. It is not deployed.

## AI-assisted work

Perplexity was used to help develop detailed engineering prompts. Cursor was the coding environment used to implement and revise the demo.

Those tools were used to:

- Generate implementation code for the API, page, and Compose file
- Revise that code when a test or the TypeScript build failed
- Troubleshoot the test runner under `"type": "module"`
- Iterate on the Jest cases from the acceptance rules above
- Accelerate documentation drafts

They worked inside decisions the developer had already made. They did not choose the slice, the role split, the employee-to-user link, or the toy formula. They were not given production source or production data.

## Development loop

A representative loop for this repository:

```text
Business requirement
        ↓
Human design / decision
        ↓
AI-assisted implementation
        ↓
Human review
        ↓
Automated tests
        ↓
Manual verification
        ↓
Revision
```

The same shape, one level up, is how the work was sequenced:

```text
Business problem
      ↓
Requirements
      ↓
Process redesign
      ↓
Architecture
      ↓
Detailed prompts
      ↓
AI-assisted implementation
      ↓
Human code review
      ↓
Automated testing
      ↓
Manual/browser testing
      ↓
Redesign where necessary
      ↓
Acceptance
```

Example: the requirement was that a processor must not close the run. The developer decided the check belongs in route middleware, before the workflow looks at payslip status, so the response is 403 rather than a business-rule error. Implementation followed that order. A Jest test signs in as the processor, finalises every payslip, and expects 403 on close.

## Important principle

AI assistance accelerated implementation; it did not transfer responsibility for the system design, correctness, security model, or acceptance away from the developer.
