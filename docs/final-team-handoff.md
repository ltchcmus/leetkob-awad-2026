# Team baseline and follow-up

Remote branch after publication:
https://github.com/ltchcmus/leetkob-awad-2026/tree/integration/pa3

## Setup and feature branches

```powershell
git fetch origin
git switch -c feat/hau-api-finalization origin/integration/pa3
# Thịnh uses this instead in his checkout:
git switch -c feat/thinh-persistence-review origin/integration/pa3
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.11.0
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
```

Each member creates only their own branch. Target new pull requests at
`integration/pa3`. Resolve the baseline SHA with
`git rev-parse origin/integration/pa3`.
Worker setup, checker commands, Docker commands and persistence signatures
are in [the execution handoff](checker-worker-handoff.md).

## Hậu

- Review every problem/solution/constraint tuple in
  [hard-rule findings](../runs/pa3-dev/hard-rule-findings.json).
  There are 28 unresolved ban-list pairs and two additional incorrect
  decisions. Add regression tests for these exact failures and general
  syntax variants. Keep the official labels and evaluator intact.
- Preserve HTTP role, class ownership, student ownership and status privacy
  tests. Complete deployment authentication/accounts and verify that
  unpublished model evidence and deductions remain TA-only. Local tests
  already cover class isolation; repeat them against the public deployment.
- Review unresolved G1/G4 contract decisions and the Product Owners FAQ
  with Thịnh, then complete G12 submission documentation and review own
  evaluation labels.

Acceptance requires complete ban-list coverage with zero wrongful
deductions, passing trap/injection regressions, and endpoint tests for
foreign TA/student access and unpublished result privacy.

## Thịnh

- Add durable quarantine and attempt-UUID cleanup reconciliation to queue
  recovery. A killed active worker must not automatically rerun a sandbox
  with uncertain cleanup. Include real process/container crash tests.
- Retain lease fencing and atomic exactly-one verdict persistence. Exercise
  stale completion, duplicate delivery, restart and concurrent workers.
- Add allowlisted attempt metadata and a trusted identity-redaction context.
  Implement durable model quota reservations and idempotent settlement
  across process restarts. Production model calls remain disabled in the
  built-in worker until these interfaces are supplied.
- Complete TA review decisions/deductions, Publish fail-closed and audit.
  Verify all pending review paths and cross-class privacy with real HTTP.
- Prepare G8 public E2E using five accounts, FAQ decisions, G9a separate own
  cases and G11 rubric audit.

The execution worker is implemented. Extend its repository interfaces
described in the execution handoff.

## Existing PRs

PRs #15 and #18 have the same head. PR #17 includes their history and
PR #16. PR #19 supplies Sandbox history. All five heads are ancestors of
this baseline. After hosted checks and team baseline confirmation, the
owners may close the old PRs as superseded, linking the integration branch.
No old PR needs a separate merge to assemble this baseline.

## Readiness

Local integration and hosted baseline checks support continued team
development. Release readiness still needs public VPS E2E, durable
cleanup/budget work, checker quality improvements and release-tag CI.
Semantic model quality and hard-rule correctness have separate findings.
