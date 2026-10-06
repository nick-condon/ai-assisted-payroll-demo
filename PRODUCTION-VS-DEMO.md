# Production system and this demo

The production system is a school payroll application that I designed and deployed. It supports approximately 125 employees, four administrative users, and around 50 employee self-service users.

The original business brief described a spreadsheet-led fortnightly process with manual pay adjustments, cash and bank-payment preparation, monthly statutory reporting, accounting entry, and individual payslip distribution. It also identified reliance on one experienced administrator and the need to preserve practical workflows such as cash payments and printed payslips. The full business context is described in the [README](README.md#production-context-and-this-demo).

This repository is a separate, fictional vertical slice. It is not a copy of the production system and is not intended to become one. The comparison below distinguishes production capabilities from what a reviewer can exercise locally.

| Concern | Production system | Public demo |
| --- | --- | --- |
| Purpose | Real school payroll | Synthetic engineering demonstration |
| Data | Real operational data | Fictional employees, salaries, leave, and allowances |
| Identity | Google OIDC with PKCE and server-side sessions | A local sign-in picker and an HttpOnly session cookie |
| Payroll rules | The organisation's real pay rules | Toy formula: annual salary / 26, unpaid days at annual salary / 260 |
| Users | Real staff | Four fictional roles, five fictional employees, and two employee sign-ins |
| Self-service | A real employee self-service experience | A simplified page that shows one fictional employee's own profile and payslips |
| Stack | TypeScript, Node.js, Express, PostgreSQL on Cloud SQL | TypeScript, Node.js, Express, PostgreSQL 16 |
| Authorization | Server-side RBAC | Server-side RBAC, plus payslip queries scoped to one employee |
| Tests | Automated tests | Jest for the formula, roles, workflow, and record isolation |
| Deployment | Google Cloud | Local Docker Compose only |
| Scope | The full operational workflow | One open fortnight, generate, finalise, close, and own-record reads |

The differences are deliberate. A public copy of the production application would publish employee data, organisation-specific rules, and deployment detail. This repository keeps a relational pay run, authorisation that does not trust the browser, a close step separated from preparation, automated tests, and a page a reviewer can operate. It is not a visual or functional reproduction of the production system.

Sign-in in this repository is a demo picker so the payroll roles and two employee sign-ins can be exercised without an OAuth client. The production system authenticates with Google and keeps session state on the server. This demo keeps session state on the server as well: the cookie does not carry the role, and it does not carry permission to read another employee's payslip.

The production employee experience is private and is not reproduced here. The demo's employee page exists to show server-side record isolation with fictional payslips.

The toy formula is published in the README so a reader can recompute a payslip. It is not the production calculation.
