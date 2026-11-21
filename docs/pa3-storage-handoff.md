# Durable queue and worker handoff

Technical implementation owner: Thịnh (23120200), with Codex assistance.
Base: `1c194cd2568397c474c63c346e1cde99af06ec59`.

## Current verification

- Storage: implemented; 21 database/queue regressions pass, including migration
  from PA2, atomic admission/results, lease fencing, infrastructure retries,
  counted-head protection and fail-closed Publish.
- Worker: implemented as a separate executable process. Ten offline tests cover
  orchestration, stop/restart, an active-process crash, checkpoint recovery and
  invalid checker output. The process tests use an explicitly configured test
  adapter; they do not prove sandbox isolation or real model behavior.
- Compatibility: all 26 existing tests still pass; the current total is 65.
  Lint, format check and strict TypeScript checks pass on Node 24.11.0. See the committed
  [storage run](evidence/pa3-storage/storage-tests.txt) and
  [worker run](evidence/pa3-storage/worker-tests.txt).
  The [final run](evidence/pa3-storage/final-tests.txt) additionally includes five
  HTTP integration cases and three evaluation-data validation cases.
- Pending integration: API routes/authentication owned by Hậu, real sandbox and
  checker adapters owned by Công, and the public deployment walkthrough.
  No API implementation, protected-main setting, remote branch or tag was changed.

Five own evaluation cases and the official 128-file integrity manifest are ready
in `test/eval-cases/`. Their structural validation passes; sandbox Accepted checks
and Hậu's independent label review remain pending.

## API integration

Use `WorkflowRepository` from `src/db/workflow-repository.ts`; it extends
`PublicationRepository` and retains the existing `publish` and access interface.
Use the same persistent database file for API and worker processes.

| Operation                           | Storage call                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Trusted synthetic account bootstrap | `provisionUser({ id, role })`                                                               |
| Admin creates class / assigns TA    | `createClass(actor, name)`, `assignTa(actor, classId, taId)`                                |
| TA/admin enrolls student            | `enrollStudent(actor, classId, studentId)`                                                  |
| TA creates lab                      | `createLab(actor, { classId, statement, deadline, tests, constraints, cpuMs?, memoryMb? })` |
| Student submits                     | `submit(actor, labId, { source, idempotencyKey? }, receivedAtMs)`                           |
| Student polls                       | `getSubmissionForStudent(actor, submissionId)`                                              |
| TA opens queue                      | `getReviewQueue(actor, labId)`                                                              |
| TA makes decision                   | `reviewConstraint(actor, reviewId, { decision, evidence, reason, expectedVersion }, nowMs)` |
| Publish                             | Existing `publish(labId, actor, new Date(nowMs))`                                           |

`provisionUser` is a trusted bootstrap operation, not an unauthenticated route.
Credentials and token verification remain in the API adapter. Student status
contains processing state, nullable judge result and per-test verdicts; it never
serializes constraint results, hidden test inputs/outputs or deductions.
New error codes in `WorkflowError` need HTTP mappings agreed by the API owner;
they must not leak raw SQLite exceptions. Existing PA2 `Problem` errors are unchanged.
See [storage contract](pa3-storage-contract.md) for the concrete requested amendments.

## Sandbox and checker integration

Implement a trusted server module exporting `adapters: PipelineAdapters`, matching
`src/worker/types.ts`. The worker calls `runInSandbox(claim, signal)`. Return a
discriminated infrastructure failure or a genuine judge result, including test
verdicts. An AC requires all configured tests to be present and AC. The sandbox
must kill the whole container when its abort signal fires; the worker's watchdog
alone cannot prove that cleanup.

For AC, the worker calls `checkSubmission({ solution, statement, source, constraints }, signal)`.
Return `{ solution, evaluations }`. Use the shared hard-rule-first checker core;
never forward `solution` or other bookkeeping IDs to the provider. The worker
passes original source so the checker can preserve evidence mapping. Provider
sanitization, genuine request IDs, schema/time limits and costs remain the model
adapter's responsibility. Worker-level protocol failures become TA-only unsure.

```powershell
$env:DATABASE_PATH = '<absolute persistent database path>'
$env:WORKER_ADAPTER_MODULE = '<absolute path to the reviewed adapter module>'
node src/worker/main.ts
```

Optional configuration: `WORKER_LEASE_MS` (default 30000), `WORKER_POLL_MS`
(250), `WORKER_ADAPTER_TIMEOUT_MS` (300000), `WORKER_ONCE=1` (one claim attempt).
The production entrypoint refuses to start without a persistent database and an
explicit adapter module. No fake adapter is selected by default. Structured
worker logs contain event/job/error codes, never raw exceptions or submitted code.

## Migration and release cautions

`PublicationRepository` applies the checksum-tracked migration on opening a store.
PA2 table shapes remain unchanged; new data lives in related tables. Stop writers
and back up the database before upgrading. Downgrading with
`src/db/migrations/001_pa3.down.sql` deliberately destroys PA3 data and must never
run automatically; the seven PA2 tables remain intact.

The local historical `pa2` tag points at `2f6e785`, while the remote annotated tag
peels to `1c194cd`. The fetch refused to overwrite it and this work preserved it.
The release owner should use a fresh authoritative clone when preparing the final
archive; do not force-move either tag as part of integrating this branch.

This handoff is technical evidence, not a claim that a teammate has reviewed or
approved it. Integration ACKs and live acceptance results must be recorded when
they actually occur.
