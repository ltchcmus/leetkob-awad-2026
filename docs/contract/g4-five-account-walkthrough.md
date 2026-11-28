# G4 five-account local walkthrough

This walkthrough is a repeatable local API/security exercise. It is not a
claim of a public deployment, a public E2E run, or worker availability.

## Principals

The persisted fixtures use five synthetic principals:

| Principal  | Role      | Purpose                                                       |
| ---------- | --------- | ------------------------------------------------------------- |
| Admin      | `admin`   | Trusted bootstrap for classes and membership.                 |
| Owning TA  | `ta`      | Owns the class and can create labs, review and publish.       |
| Foreign TA | `ta`      | Owns another class and must receive non-disclosing responses. |
| Student A  | `student` | Enrolled submitter.                                           |
| Student B  | `student` | Other student who must not read Student A's submission.       |

The bootstrap is a trusted repository operation. There is intentionally no
public Admin HTTP route for user provisioning, class creation, TA assignment or
enrolment.

## Reproduction

Use Node.js 24.11.0 and the locked dependencies:

```powershell
npm ci
node --test --test-reporter=spec test/startup-auth-hardening.test.ts test/api-authz.test.ts test/api-workflow.test.ts test/pa3.contract.test.ts
```

The tests create an isolated SQLite database and temporary trusted adapter
module. They do not use real credentials, a public server, or a model provider.

## Flow and expected boundaries

1. The trusted bootstrap provisions the five principals, creates classes,
   assigns each TA to its own class, and enrols Student A.
2. The owning TA creates a lab with statement, test case and constraints through
   `POST /v1/labs`; the foreign TA cannot create into that class.
3. Student A submits C++ through `POST /v1/labs/{labId}/submissions` and receives
   a persisted UUID receipt. Student A can read only that submission's status.
4. The persisted worker/checker fixture advances an Accepted submission to a
   review queue. This is a local persistence fixture, not a public worker E2E
   claim.
5. The owning TA reads the queue and posts a review decision. Success is `204 No
Content`; version and audit changes are verified from persisted storage.
6. The existing PA#2 Publish contract continues to return its `200` receipt only
   after the workflow allows publication.

The same run verifies these negative paths without database mutation:

- missing or invalid Bearer credential: `401`;
- Admin or Student attempting TA operations: `403`;
- foreign TA lab/review access and Student B reading Student A's submission:
  non-disclosing `404`;
- student status does not expose constraint verdicts, deductions or evidence
  before Publish;
- malformed/raw route variants remain covered by the PA#2 contract tests.

## Deployment boundary

For a deployed process, configure an absolute `AUTH_ADAPTER_MODULE`. Startup
fails before listen when `NODE_ENV=production` or a non-loopback `HOST` is used
without that adapter. The local `DEMO_AUTH_TOKEN` fallback is limited to
`127.0.0.1` or `::1` development.

External deployment, a separately running worker, Docker and public account
