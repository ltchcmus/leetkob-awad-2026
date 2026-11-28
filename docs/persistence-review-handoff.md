# Persistence and review integration

Branch: `feat/thinh-persistence-review`; PR base: `integration/pa3`.
Baseline: `5c0de63963c164b5e4f47e5b305d1f55ec33cb9a`.
Owner: Thịnh, with Codex assistance. The existing execution worker is retained.

## Cleanup and recovery

The worker records `startSandboxAttempt` before calling Docker. Cleanup state is
stored by attempt UUID, fenced by the current unexpired lease. A process crash
leaves cleanup pending. Expired-lease recovery changes that state to quarantine;
`claimJob` excludes quarantined jobs. There is no automatic second sandbox run.
Successful retryable cleanup persists confirmation, so a different process can
authorize the retry without relying on an in-memory map.

Operator commands, with the existing persistent `DATABASE_PATH`:

```text
node src/worker/reconcile-main.ts --list
node src/worker/reconcile-main.ts <attempt-UUID> <operator-ID>
```

Reconciliation removes only containers bearing `leetkob.sandbox.run=<UUID>`,
lists again to verify absence, and records the operator/result. Failure leaves
quarantine intact. A live lease cannot be reconciled. No public cleanup endpoint
is exposed. Exhausted retries remain failed; reconciliation does not reset quotas
or the attempt limit.

## Immutable admission snapshots

Migration 002 adds immutable submission snapshots of statement, ordered tests,
constraints/deductions and limits. Identical lab content reuses a version;
changed content receives the next version. Claims, checking, TA queue deductions,
mark preparation and Publish readiness use the admitted snapshot. Source remains
the immutable submission's exact UTF-8 text and SHA-256.

Already stored submissions are explicitly marked `migration-current-state`:
historical lab revisions cannot be reconstructed. Stop API/workers and back up
the database before upgrading. Active pre-upgrade attempts are quarantined.
Migration 001 and original datasets are unchanged. Physical deletion of referenced
legacy constraint identities is still restricted by the original foreign keys;
future editing APIs must preserve identities rather than deleting history.

## Attempt evidence and identity handling

Attempt metadata allowlists policy version, source hash and snapshot version.
Raw stdout/stderr, prompts, keys and arbitrary submitted fields are not persisted.
`setTrustedIdentities(admin, userId, values)` accepts server-approved names/IDs;
the worker also includes the authenticated student ID in the trusted redaction
context. This context goes to the existing sanitizer, not into provider data.
Provider request and response IDs are separate fields; unavailable IDs are never
invented or relabelled.

## Durable model admission

`DurableLedger` supplies `configure`, `reserveAttempt`, and `settleAttempt`.
All reservations are SQLite immediate transactions, with lab call/token/cost caps
and provider rolling minute/day/concurrency limits across processes. Where
policies differ, the strictest shared cap applies. Replaying an attempt returns
`dispatchAllowed: false`; it never authorizes another POST. Confirmed usage is
settled once. Missing usage/disconnects retain both budget and concurrency until
trusted reconciliation. Never expire an uncertain reservation merely to retry.

The execution adapter wraps providers with this ledger when `MODEL_OFF=0`.
Existing provider/account free-tier confirmation and USD 0 checks still apply.
No policy rows means no dispatch. Configure only account-confirmed free limits
through trusted backend tooling; do not provision keys or enable paid calls as
part of deploying this branch. No real model call was made by this work.

## Tests and remaining handoffs

`npm test` includes persistence/ledger and authenticated HTTP regressions.
The Sandbox workflow discovers the added real-container tests: ten Accepted own
cases, forced worker death with UUID cleanup, and five HTTP actors submitting
three sorting cases followed by review, configured deductions and Publish.
The latter is local acceptance, not a public-deployment sign-off.

The original five own cases remain in `test/eval-cases/own`. Five further cases
are in `test/eval-cases/pa4-extra`, preserving the existing checker smoke test's
ten-row expectation. Hậu still needs to ACK the labels. Công still owns public
deployment, approved account limits, the real worker/model walkthrough and release.
Hậu owns authentication/status finalization and submission documents. The final
tag's CI, public five-account walkthrough, self-assessment and fresh ZIP audit
must be checked against one exact release SHA before signing off.
