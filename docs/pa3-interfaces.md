# PA#3 interface proposal

**Status:** PROPOSED — G1 draft, not frozen. It preserves the PA#2
`POST /v1/labs/{labId}/publish` contract. It does not assert that the routes,
database schema, worker, sandbox, model, or Product Owners FAQ behaviour below
already exist.

## Boundaries and principals

Principals have one of `admin`, `ta`, or `student` roles. A TA is authorized
only for labs and review queues in a class currently assigned to that TA. A
student is authorized only for their own submissions in a class in which they
are enrolled. Authorization is enforced server-side and inside the relevant
transaction; authentication alone does not confer class ownership.

The existing PA#2 publish endpoint remains TA-only. Its existing `401`,
`403`, `404`, `409`, persistence, replay, and RFC 9457 behaviour is unchanged.

## Proposed HTTP resources

All new errors use RFC 9457 problem JSON and the existing no-store/nosniff
security headers. `401` means missing or invalid authentication, `403` means
an authenticated role cannot take an action, and `404` is used when revealing a
lab, review queue, or another student's submission would disclose its
existence. Failed authorization, validation, and precondition requests must
not mutate the database.

| Route                                  | Caller             | Proposed result             | Ownership/error semantics                                                                                                                                                                                                                                        |
| -------------------------------------- | ------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/labs`                        | assigned TA        | `201` lab summary           | A TA creates only in an assigned class. Student/admin callers get `403`; a foreign/nonexistent class is `404`.                                                                                                                                                   |
| `GET /v1/labs/{labId}`                 | owning TA          | `200` lab summary           | A foreign TA gets indistinguishable `404`; the response omits student code and unpublished verdicts.                                                                                                                                                             |
| `POST /v1/labs/{labId}/submissions`    | enrolled student   | `202` submission receipt    | Foreign/missing lab or unenrolled student is `404`. Request retry semantics are **PENDING Thịnh**.                                                                                                                                                               |
| `GET /v1/submissions/{submissionId}`   | submitting student | `200` student status        | Other students receive `404`; before Publish the response contains processing status, final judge verdict when available, and per-test verdicts only. It never contains constraint evaluation, deduction, or evidence. FAQ-02 and FAQ-08 define this visibility. |
| `GET /v1/labs/{labId}/reviews`         | owning TA          | `200` review items          | Foreign TA gets `404`; includes per-constraint verdict/evidence only for the owning TA.                                                                                                                                                                          |
| `POST /v1/reviews/{reviewId}/decision` | owning TA          | `204` with no response body | Successful review updates return `204 No Content` with an empty body. Student/admin callers get `403`; foreign review gets `404`; invalid input gets `400`; stale version, already-published, or stale-submission state gets `409`.                              |
| `POST /v1/labs/{labId}/publish`        | owning TA          | existing PA2 `200` receipt  | Kept exactly as specified by `docs/contract/publish-lab.md`; it fails closed while queued/running judge work or required reviews remain.                                                                                                                         |

## Proposed DTOs

```ts
type ConstraintInput = {
  id: string;
  text: string;
  deductionTenths: number;
};

type CreateLabRequest = {
  classId: number;
  statement: string;
  tests: Array<{ input: string; expectedOutput: string }>;
  constraints: ConstraintInput[];
};

type CreateSubmissionRequest = {
  source: string;
  // Idempotency field and semantics: PENDING Thịnh.
};

type SubmissionReceipt = {
  submissionId: string;
  status: "queued";
  createdAt: string;
};

type StudentSubmissionStatus = {
  submissionId: string;
  status: "queued" | "running" | "retrying" | "completed" | "failed";
  judgeVerdict: "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | null;
  testVerdicts: Array<"AC" | "WA" | "TLE" | "MLE" | "RE" | "CE">;
  createdAt: string;
  // No test input/output, constraint verdict, deduction, deductionTenths, or evidence before Publish.
};

type ConstraintVerdict = {
  constraintId: string;
  verdict: "pass" | "violation" | "unsure";
  evidence: Array<{ line: number; text: string }>;
};
type ReviewQueueResponse = {
  items: Array<{
    reviewId: string;
    submissionId: string;
    constraints: ConstraintVerdict[];
  }>;
};

type ReviewDecisionRequest = {
  decision: "pass" | "violation";
  evidence: Array<{ line: number; text: string }>;
  reason: string;
  expectedVersion: number; // Nonnegative optimistic-lock version.
};
```

`POST /v1/reviews/{reviewId}/decision` accepts `ReviewDecisionRequest` and,
on success, returns `204 No Content` with an empty body. The update, version
increment, and review audit record are persisted atomically by the storage
boundary. It intentionally returns no review or audit DTO.

`deductionTenths` is selected by the TA, never returned by the model, and is
not editable through model output. Precise size limits and validation errors
are **PENDING Hậu review with Thịnh**.

## Queue, sandbox, and model boundary

```ts
type JudgeJob = {
  jobId: string;
  submissionId: string;
  labId: number;
  attempt: number;
  source: string;
  tests: Array<{ input: string; expectedOutput: string }>;
};

type SandboxResult = {
  judgeStatus: "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE";
  stdout: string;
  stderr: string;
};

type ModelConstraintResult = ConstraintVerdict;
```

`JudgeJob` persistence, leasing, retry, and exactly-once stored-verdict
semantics are **PENDING Thịnh**. Sandbox invocation and the model adapter are
**PENDING Công**. The model receives only statement, constraints, and
comment-stripped source without student identity; invalid schema or timeout
becomes `unsure`.

## Checker CLI proposal

```text
leetkob-checker --data <dataset-directory> --predictions <output.jsonl>
```

With `MODEL_OFF=1`, the checker opens no network connection, decides hard-rule
constraints locally, and writes `unsure` for semantic constraints. JSONL rows
use `solution`, `constraint`, `verdict`, and `evidence` as specified by the
class brief. CLI implementation, Docker image, and exact output validation
are **PENDING Công/Hậu**.

## Decisions still required

- Product Owners FAQ: exact pre-Publish student visibility.
- Thịnh: submission idempotency key/receipt, DB IDs, queue/review state machine
  and audit records.
- Công: sandbox-result details, model-adapter error mapping, provider cost/log
  fields, and CLI packaging.
- Hậu: final HTTP validation limits, exact error slugs, and contract-test
  fixtures after the above DTOs receive ACK.

## Contract amendment: checker and student status

**Status:** PROPOSED/PENDING ACK. This amendment refines the G1 proposal only; it does not implement a checker, worker, CLI, or HTTP handler.

### Student status visibility

`GET /v1/submissions/{submissionId}` returns the processing `status`, nullable final
judge verdict as `judgeVerdict`, and `testVerdicts` to the submitting student. A
queued/running submission has `judgeVerdict: null` and an empty `testVerdicts`
array. The per-test array contains verdicts only: it never exposes hidden test
input or output. This is the FAQ-02 visibility rule.

Before Publish, this response must not contain `constraintVerdicts`, `deduction`, `deductionTenths`, or internal `evidence`. Constraint evaluation is separate from the judge verdict and remains TA-only under FAQ-08. The exact student-facing representation after Publish is **PENDING Product Owners FAQ**.

### Shared checker contract for G5/G6

```ts
type ConstraintVerdictKind = "pass" | "violation" | "unsure";
type EvidenceLine = { line: number; text: string };

type CheckerConstraint = {
  id: string;
  text: string;
  deductionTenths: number;
};

type CheckerInput = {
  solution: string;
  statement: string;
  source: string;
  constraints: CheckerConstraint[];
};

type ConstraintEvaluation = {
  constraintId: string;
  verdict: ConstraintVerdictKind;
  source: "hard-rule" | "model";
  evidence: EvidenceLine[];
};

type CheckerOutput = {
  solution: string;
  evaluations: ConstraintEvaluation[];
};
```

Hard rules run first. A hard-rule decision is final for that constraint: only constraints without a hard-rule decision are sent to the model, and a model result cannot override a hard-rule verdict. `pass`, `violation`, and `unsure` are evaluator verdicts, not marks.

Each `EvidenceLine.line` is a 1-based line number in the original submitted C++ source. The model may receive comment-stripped source, but its evidence must map back to and match the original source line.

`deductionTenths` is the TA-configured canonical integer amount in tenths of a mark. The presentation conversion is `deduction = deductionTenths / 10` marks. The checker never returns a deduction or changes it. The worker/review/publish path applies the TA-configured deduction only after the required human decision; score aggregation, rounding, and persistence are **PENDING Thịnh**.

The checker CLI dataset adapter reads each dataset case into `CheckerInput` and writes one JSONL row per `(solution, constraint)` using `{ solution, constraint, verdict, evidence }`. `MODEL_OFF=1` performs hard-rule evaluation only and writes `unsure` for every semantic constraint without opening a network connection. Dataset directory traversal, Docker packaging, and the final CLI command remain **PENDING Công/Hậu**.
