# PA#3 evidence guide — LeeTKOB

## Scope and status

LeeTKOB is a pre-publication review workflow for C++ lab submissions. A TA
defines a class lab and its constraints; a student submits source; a separate
worker judges it; Accepted source is checked; and the TA reviews evidence before
the PA#2 publication transaction may publish marks.

This document describes code and local evidence present in this repository at
the PA#3 prototype checkpoint. It does not claim a public deployment, a release
tag, a passing official evaluator, or full rubric completion.

## Architecture

```text
HTTP API -> WorkflowRepository (SQLite) -> durable submission/job state
                                      |
                                      v
                              separate execution worker
                                      |
                                      v
                              Docker sandbox judge
                                      |
                    non-AC -> persisted final judge status
                    AC     -> hard-rule checker -> semantic router
                                                  -> TA review queue
                                                          |
                                                          v
                                               TA decision -> PA#2 Publish
```

The API and worker use the same persistent `DATABASE_PATH`. The HTTP handler
does not execute submitted C++. The worker uses the repository job leasing and
checkpoint operations; its adapter invokes the sandbox only after policy
validation. The persistence/recovery details and known follow-ups are in
[docs/checker-worker-handoff.md](docs/checker-worker-handoff.md).

## Setup

Use Node.js 24.11.0 and install the lockfile dependencies.

```powershell
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
```

These commands are defined in `package.json`. At the documented checkpoint,
the complete local suite passes 163 tests with zero failures or skips on Node.js
24.11.0. It is local evidence only.

Focused suites are available when investigating a boundary:

```powershell
npm run test:pa2
npm run test:g1-contract
npm run test:g5
```

## Authentication and authorization

`src/auth.ts` accepts a configured demo token for the historical PA#2 demo and
can load an absolute trusted server-side adapter through `AUTH_ADAPTER_MODULE`.
The adapter returns an authenticated principal; it neither creates accounts nor
bypasses authorization.

- Missing, malformed or invalid Bearer credentials receive 401.
- A role without the route's permission receives 403.
- A TA cannot distinguish an absent resource from another class's resource;
  both receive the contract's 404 response.
- A student can read only that student's submission status. The status response
  before Publish includes progress, final judge verdict when available, and
  per-test verdicts—not constraints, deductions or evidence.

Route DTOs and response boundaries are in
[docs/pa3-interfaces.md](docs/pa3-interfaces.md). The established PA#2 Publish
contract remains [docs/contract/publish-lab.md](docs/contract/publish-lab.md).

## Workflow and API surface

The implemented HTTP routes include the following product flow.

| Route                                  | Role                     | Boundary                                                   |
| -------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| `POST /v1/labs`                        | TA assigned to the class | Creates a persisted lab.                                   |
| `GET /v1/labs/{labId}`                 | Owning TA                | Returns only lab ID, class ID and statement.               |
| `POST /v1/labs/{labId}/submissions`    | Enrolled student         | Persists source and returns a UUID receipt.                |
| `GET /v1/submissions/{submissionId}`   | Submitting student       | Returns status and judge-only visibility.                  |
| `GET /v1/labs/{labId}/reviews`         | Owning TA                | Returns TA-only evaluation evidence.                       |
| `POST /v1/reviews/{reviewId}/decision` | Owning TA                | Uses optimistic versioning; success is 204 with no body.   |
| `POST /v1/labs/{labId}/publish`        | Owning TA                | Retains PA#2 transaction and idempotent receipt semantics. |

Requests rejected by authentication, role or ownership checks are covered by
HTTP regression tests that assert persisted data does not change. API failures
use RFC 9457 problem details.

## Worker and sandbox

Start the API with the existing package command:

```powershell
npm start
```

The worker must be configured with the same explicit database path and a
trusted adapter/image before it is run:

```powershell
$env:MODEL_OFF = '1'
node src/worker/main.ts
```

The sandbox implementation has policy validation and tests for isolation
properties, including no network, CPU/wall limits, memory/swap, process count,
output size, non-root execution, no host mounts/Docker socket, and no model
secret passed to the judge. The local test evidence does not establish that a
public deployment has these protections operationally.

The integrated persistence boundary includes durable cleanup reconciliation,
model quota reservations and a trusted identity-redaction context. Public
operations, deployment configuration, release-tag CI and submission archive work
are separate packaging handoff items; they are not PA#3 implementation blockers
unless the authoritative assignment requires them.

## Checker and review boundary

Hard rules run before semantic routing. A constraint is a deterministic ban list
only when it starts with `Do not use` or `Do not call` and names banned symbols
in backticks. The checker tokenizes C++ source and preserves original 1-based
line numbers. It covers namespace qualification/imports, direct aliases,
comments, strings, raw strings, multiline uses, custom namespaces and selected
macro expansion cases. A definite hard-rule result is terminal; the semantic
router cannot override it.

The checker produces `pass`, `violation` or `unsure`, plus evidence for a
violation. It never computes or returns a deduction. Deductions are configured
by the TA and are applied only after TA review. Ambiguous macro/alias cases are
kept as `unsure` rather than making a deduction.

`MODEL_OFF=1` performs no model dispatch. Semantic constraints consequently
remain `unsure`, which is safe but insufficient to meet the evaluator's full
quality thresholds.

## Checker CLI and demo

The CLI is a real entry point and takes a dataset folder plus a JSONL output
path. A local fixture can be exercised without a network connection.

```powershell
$env:MODEL_OFF = '1'
node src/checker/cli.ts --data test/eval-cases/own --predictions predictions.jsonl
```

The dataset adapter reads:

```text
problems/<problem-id>/statement.md
problems/<problem-id>/constraints.json
solutions/<problem-id>/<solution>.cpp
```

It writes one JSON object per `(solution, constraint)` with `solution`,
`constraint`, `verdict`, and `evidence` fields. The official dataset is a
separate checkout; no official source, label or evaluator is stored or modified
by this workflow.

## Official evaluation result

The latest offline run used official evaluator revision
`552c811db2d35a23d641bc4fdffc1ac120be1a28` and exited as follows:

| Metric              |        Result |     Required |
| ------------------- | ------------: | -----------: |
| Pairs               |           102 |            — |
| Pass                |            40 |            — |
| Violation           |            15 |            — |
| Unsure              |            47 |  at most 20% |
| Wrongful deductions |             0 |            0 |
| Recall              | 40.5% (15/37) | at least 90% |
| CLI exit            |             0 |            0 |
| Evaluator exit      |             1 |            0 |

The run fails because the full evaluator thresholds are not met. The remaining
uncertain cases are semantic constraints that cannot be safely decided by the
current lexical hard-rule matcher. This is an evaluator result, not evidence
that those thresholds are PA#3 rubric requirements: the original PA#3 rubric is
not stored in this repository, so that applicability remains not verified. This
document does not claim evaluator PASS.
The reproduction context and prior run records are in
[runs/pa3-dev/README.md](runs/pa3-dev/README.md).

## Local demo checklist

1. Run the four quality commands above.
2. Run `npm test` to exercise persisted HTTP authorization, submission,
   worker, review and Publish paths with synthetic identities.
3. Run the MODEL_OFF CLI fixture command above and inspect its JSONL output.
4. If Docker, a trusted worker adapter, and a seeded persistent workflow are
   available, follow the worker configuration in
   [docs/checker-worker-handoff.md](docs/checker-worker-handoff.md).

Steps 1–3 are reproducible in the repository. Step 4 is an operational
prerequisite, not evidence that a public production service is running.

## Verification boundaries

- The original PA#3 rubric is not stored in this repository. Exact scoring and
  whether evaluator thresholds apply to PA#3 are therefore **NOT VERIFIED**.
- Public deployment, release tags, final archive checks and account provisioning
  are packaging/operations handoff items. They are required only if the official
  assignment or submission process says so.
- Production provider enablement requires separately approved configuration; it
  is not claimed by the repository's local MODEL_OFF evidence.

The historical PA#2 release evidence remains in [PA2.md](PA2.md). The current
assessment by rubric criterion is in
[SELF_ASSESSMENT_REPORT.md](SELF_ASSESSMENT_REPORT.md).
