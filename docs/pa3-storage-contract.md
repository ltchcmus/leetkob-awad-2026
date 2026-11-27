# Submission processing and storage contract

Status: technical proposal for the API, sandbox and checker owners to acknowledge.
Base: `1c194cd2568397c474c63c346e1cde99af06ec59`; reviewed interface proposal:
`b79e897f3d7fe0c4cf65a18353a58946446123a8` ([PR 15](https://github.com/ltchcmus/leetkob-awad-2026/pull/15)).
This document specifies the storage boundary; it does not claim deployed integration.

## Identity, admission and counted submissions

- Legacy numeric lab IDs and PA2 table shapes remain unchanged. New immutable
  submissions, jobs, execution attempts and review items have opaque UUID strings.
  A stable numeric counted-submission row represents one student in one lab;
  `counted_heads` points it to the latest admitted immutable submission.
- A new submission increments its student's lab sequence. A worker retry creates
  an execution attempt, never another submission or counted row.
- `submit(student, labId, { source, idempotencyKey? }, now)` atomically persists
  source, receipt, counted head and job. An optional HTTP `Idempotency-Key` maps
  to `idempotencyKey`; scope is student + lab + key, with no expiry. Same source
  returns the original receipt; different source is `idempotency-conflict`.
  Without a key, each request is a new submission. An authorized replay after
  the deadline is allowed; a new submission at or after the deadline is refused.
- Recheck enrollment on replays. Validate UTF-8 source size (64 KiB), constraint
  uniqueness and integer TA deductions in tenths, with no score input from students.
- Server receipt time and transaction order choose the last eligible submission.
  Old worker results remain attached to their own immutable submission and never
  replace the current counted result or appear in its review queue.

## Queue and sandbox boundary

- Job states: `queued`, `leased`, `retry_wait`, `completed`, `failed`.
  Judge result is independently nullable `AC|WA|TLE|MLE|RE|CE`.
  Checker states: `pending`, `running`, `complete`, `not_required`.
- `claimJob(workerId, { now, leaseMs })` uses a short immediate transaction.
  It recovers expired leases, selects an eligible job and creates an attempt
  with a fresh fencing token. `renewLease` is conditional on that current token.
  No transaction is held during sandbox or model work.
- Completion requires a current, unexpired lease token. A resumed old worker
  cannot commit after another worker recovers its lease. Recovery and retries
  preserve accepted source and any already persisted judge result.
- The sandbox adapter must distinguish `{ kind: "judged", judgeStatus, tests }`
  from `{ kind: "infrastructure_error", code }`. Engine/transport/image failures
  are retryable infrastructure errors, never student `WA` or `RE`.
  After bounded retries, the job becomes `failed`; judge result may remain null
  and Publish stays blocked. The UI may report processing failure separately.
- CPU/wall/memory/output violations from a functioning sandbox are student
  results. Compile/run isolation and the nine attack tests belong to the sandbox
  owner. This repository never executes submitted C++ directly.
- A worker process receives trusted adapter modules explicitly. There is no fake
  production fallback. Only AC reaches the shared checker; non-AC skips it.

## Exactly one stored set and human review

- `recordJudgeResult` stores the final judge result under the lease. AC keeps the
  job active for checking. A restart after this checkpoint can resume checking.
- `completeChecking` atomically writes a unique verdict set, every constraint's
  verdict/evidence, its review item, the review-initialized flag and job completion.
  A repeated completion does not overwrite the first set. Missing/duplicate
  constraints or invalid evidence are rejected before writes.
- Evidence uses 1-based ORIGINAL source lines and their exact text. Verdicts are
  `pass|violation|unsure`; origin is `hard-rule|model|guardrail`; an optional reason
  explains uncertainty. The checker cannot supply a deduction or a mark.
- Review items are per submission/constraint. TA DTO fields include review ID,
  submission ID, constraint ID/text, verdict, original evidence, reason,
  TA-configured `deductionTenths`, human decision and review version.
- `reviewConstraint` accepts `decision: pass|violation`, evidence, reason and
  `expectedVersion`. A violation needs original-code evidence. Store actor/time,
  previous/new decision and evidence in an audit row. Check class ownership and
  counted-head freshness inside the same transaction. Stale versions conflict.
- For this prototype all constraint verdicts require review, including passes.
  This is a conservative PA3 policy; it does not claim PA4's random pass sampling.
  Only completed human reviews prepare the counted mark; it is clamped at zero.

## Publish compatibility and HTTP integration requests

Preserve the existing PA2 route, role checks, errors, ordering, permanent receipt,
atomic snapshot/audit and replay behavior. For new managed submissions, reject
incomplete judge/checker work, absent verdict sets, uninitialized or missing
reviews, and pending human decisions. Empty legacy labs remain publishable.
Reuse `judging-pending` or `reviews-pending`; no new PA2 public error is needed.

Before freezing the shared interface, the API owner should incorporate:

1. Pending/retrying/failed processing status with nullable judge result, and
   per-test verdicts without hidden test input/output.
2. Lab deadline and resource defaults, plus student-visible statements/constraints.
3. Optional idempotency header and conflict mapping; immutable submission IDs
   distinct from counted IDs and execution-attempt numbers.
4. Review DTO above, optimistic versioning and uncertainty reason.
5. A discriminated sandbox infrastructure-error result and fenced lease contract.
6. Explicit checker initialization checks before Publish, even with zero review rows.
7. Persisted fixtures for statements, enrollment and submissions; no hardcoded
   response values to satisfy provisional test examples.
8. Model input built from statement, constraints and sanitized source only;
   checker bookkeeping IDs must not enter provider prompts.

Product policy sources: [FAQ-02](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-02),
[FAQ-03](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-03),
[FAQ-05](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-05),
[FAQ-08](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-08),
[FAQ-09](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-09),
[FAQ-11](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-11),
[FAQ-12](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-12).
Owner acknowledgements and public deployment verification remain separate steps.
