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

## 28 November 2026 integration update

`08cac125b0d7271ae7511616eb9bb8995e9a5db4` merged PR #24, which integrates
PR #22's durable persistence/recovery changes after the G4 hardening merge.
The historical owner lists above describe the pre-integration handoff; they are
not evidence that the listed implementation work remains undone.

The current local audit records 163 passing tests with no skips, including
migration/snapshot, quota, crash-recovery, G4 authorization and G5 CLI suites.
Hosted Sandbox passed on the PR #24 candidate. Public deployment, five-account
walkthrough, final release-tag CI, final archive/secret scan and rubric-owner
confirmation of PA3 evaluation requirements remain outstanding.

Post-merge verification: GitHub push workflows passed directly on
`08cac125` for [Quality](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/46132194592)
and [Sandbox](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/46132194574).
This is not release-tag or public-deployment evidence.

## Scope correction for final audit

The final audit records implementation and CI evidence only. Public deployment,
release tag/CI, ZIP, secret scan and live five-account work are packaging or
operations handoff for Công; they are not implementation blockers unless the
authoritative PA#3 requirements explicitly require them. The repository does
not contain that authoritative rubric, so final rubric conformance is marked
`NOT VERIFIED` rather than inferred from missing deployment evidence.
