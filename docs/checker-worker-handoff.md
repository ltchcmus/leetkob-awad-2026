# Checker and execution worker handoff

## Hậu · checker and CLI

`routeHardRules(input)` returns one decision per constraint. The
`hard-rule` variant has a verdict and original-line evidence. The
`semantic` variant has only the constraint ID. Ambiguous or malformed
ban-list rules stay terminal `unsure`. The legacy
`evaluateHardRules(input)` still returns its previous shape.

`checkSubmission(input, router, signal)` runs hard rules first and invokes
the router only for the semantic subset. It returns
`{ solution, evaluations }`. The evaluations contain no deductions.

```powershell
$env:MODEL_OFF = '1'
node src/checker/cli.ts --data test/eval-cases/own --predictions <output-file>
```

The CLI accepts `problems/<id>/statement.md`, `constraints.json` and
`solutions/<id>/*.cpp`. It produces one JSONL row per pair with
`solution`, `constraint`, `verdict` and `evidence`. It uses the same
checker as the worker. It keeps the legacy single-problem input shape.
The model-off path emits no provider calls. The opt-in model path writes
allowlisted provider call records to stderr. Deductions are TA data and
are excluded from provider input and predictions. Existing API statuses
and the student-facing result shape need no change for this integration.

## Thịnh · execution worker

```powershell
$env:DATABASE_PATH = (Join-Path (Get-Location) 'data/leetkob.db')
$env:WORKER_ADAPTER_MODULE = (Resolve-Path src/worker/execution-adapters.ts).Path
$env:SANDBOX_JUDGE_IMAGE = docker image inspect leetkob-judge:sandbox-v1 --format '{{index .RepoDigests 0}}'
$env:WORKER_CONCURRENCY = '1'
$env:MODEL_OFF = '1'
node src/worker/main.ts
```

Use the same persistent database as the API. Concurrency defaults to one
and accepts one to four per process. The process reuses the repository's
`claimJob`, `renewLease`, `recordJudgeResult`, `completeChecking` and
`retryJob`. It uses the attempt UUID as the sandbox run ID and the exact
source hash and ordered test snapshot. The worker policy caps lab limits
at the trusted policy's values. Persisted non-AC results finish the job
without checker calls. An AC result is checkpointed before checking so
a checker-only retry can reuse it. The queue transaction owns final
judge/checker state and duplicate prevention.

During cancellation or lease loss, the Docker adapter waits for cleanup
before returning. New sandbox execution is allowed on retry only after
explicitly retryable infrastructure failure and confirmed cleanup in the
same worker process. Unconfirmed or nonretryable attempts stop the process
with a quarantine event rather than manufacturing a student verdict.
A reclaimed attempt without confirmed previous cleanup cannot launch
Docker. Restarting while a job is still queued and restarting after an
active judge crashed have different recovery paths.

### Persistence and review follow-up

- Add a lease-fenced operation to record cleanup state, failure reason,
  and whether the attempt may be rescheduled. Extend expired-lease recovery
  so a previous sandbox attempt must be reconciled by UUID before requeue.
  Expose explicit operator quarantine and reconciliation outcomes.
- Expose a lab snapshot version if editing labs after submission becomes
  possible. Claim currently returns the submission source with the current
  stored lab details, tests and constraints.
- The repository stores judge/test statuses and constraint evaluations.
  Add an allowlisted metadata association keyed by attempt for sandbox
  policy, source hash and model call records where needed. Keep raw stdout,
  stderr, prompts and secrets out of persistence.
- Supply a trusted redaction context for known student identifiers before
  enabling real model calls from the worker. Keep it outside the model
  payload. TA decisions, review sampling, audit and Publish remain in the
  repository/review layer. Current G2 initializes review for every
  evaluation.
- The built-in adapter starts with model off. For production model dispatch,
  use a durable ledger that atomically reserves call/tokens against lab
  and provider windows before a POST. The interface needs
  `reserveAttempt({ labId, provider, attemptId, reservedTokens, now })`
  returning a reservation ID or denied reason, and idempotent
  `settleAttempt({ reservationId, usage, outcome })`. Retain reservations
  when dispatch or usage is uncertain. Enforce the USD 0 policy and
  account-confirmed limits across processes and restarts.

## Evaluation readiness

The shared checker, dataset layout adapter and JSONL writer are wired.
The separate checker Dockerfile, hosted integration result, budget/quota
approval for a full evaluation, real predictions, scorer report, and
measured 80-submission estimate are pending. Existing Gemini smoke
evidence covers the synthetic case.

## Team integration baseline

The local `integration/pa3` branch is created from the verified G9b
candidate on `feat/cong-g6c-g7a-integration`. It contains G6 history
`1ce04f1`, G5 `1f93f84` (including G1/G2/G4), and G3 `49a9079`.
The history preserves the original test-first commits.

Create follow-up branches from the integration baseline after it is
published by the owner. Target subsequent PRs at `integration/pa3`.
Quality and Sandbox workflows accept that base and branch. CI evidence
for this combined candidate remains pending publication.

Hậu should inspect `runs/pa3-dev/hard-rule-findings.json`, address the
hard-rule algorithm findings, retain API/auth and class ownership
regressions, and complete the submission documents. The checker and
execution worker are already implemented.

Thịnh should implement the persistence interfaces described above, retain
lease fencing and exactly-one verdict persistence, complete metadata and
identity-redaction context, review/Publish/audit, E2E privacy and cross-class
checks, five deployment accounts, the Product Owners FAQ, and independent
rubric audit. Own eval cases remain separate from official ground truth.

This baseline supports continued team development. Public VPS end-to-end
verification and release-tag CI remain outstanding.
