# Production system and this demo

This demo is not a copy of the production payroll system, and it is not meant to become one.

The production system is a school payroll application that the author designed and deployed. It supports approximately 125 employees, four administrative users, and around 50 employee self-service users. This repository is a separate, fictional slice so that selected engineering ideas can be reviewed in public.

| Concern | Production system | Public demo |
| --- | --- | --- |
| Purpose | Real school payroll | Synthetic engineering demonstration |
| Data | Real operational data | Fictional employees, salaries, leave, and allowances |
| Identity | Google OIDC with PKCE and server-side sessions | A local sign-in picker and an HttpOnly session cookie |
| Payroll rules | The organisation's real pay rules | Toy formula: annual salary / 26, unpaid days at annual salary / 260 |
| Users | Real staff | Three fictional roles and five fictional employees |
| Deployment | Google Cloud | Local Docker Compose only |
| Scope | The full operational workflow | One open fortnight, generate, finalise, and close |

The differences are deliberate.

Publishing the production application would publish employee data, organisation-specific rules, and deployment detail. The demo keeps the ideas that can be shown safely: a relational pay run, authorisation that does not trust the browser, a close step separated from preparation, automated tests around those rules, and a page a reviewer can operate.

Sign-in in this repository is not a stand-in for the production identity design. It exists so the three roles can be exercised without creating an OAuth client. The production system authenticates with Google and keeps session state on the server. This demo only copies that second idea in miniature: the cookie does not carry the role.

The toy formula is published in the README so a reader can recompute a payslip. It is not the production calculation.
