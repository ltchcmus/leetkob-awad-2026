import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { schema } from "../src/repository.ts";
import { WorkflowRepository } from "../src/db/workflow-repository.ts";
import type { Principal } from "../src/repository.ts";
import type { ConstraintEvaluation } from "../src/queue/types.ts";

const start = Date.parse("2026-11-21T08:00:00.000Z");
const source = "int main() {\n  return 0;\n}\n";
const admin: Principal = { id: "admin", role: "admin" };
const ta: Principal = { id: "ta-a", role: "ta" };
const foreign: Principal = { id: "ta-b", role: "ta" };
const student: Principal = { id: "student-a", role: "student" };
const otherStudent: Principal = { id: "student-b", role: "student" };

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-queue-"));
  const path = join(directory, "app.db");
  const repo = new WorkflowRepository(path);
  const connections = [repo];
  for (const principal of [admin, ta, foreign, student, otherStudent]) {
    repo.provisionUser(principal);
  }
  const classId = repo.createClass(admin, "Class A");
  const foreignClass = repo.createClass(admin, "Class B");
  repo.assignTa(admin, classId, ta.id);
  repo.assignTa(admin, foreignClass, foreign.id);
  repo.enrollStudent(ta, classId, student.id);
  repo.enrollStudent(ta, classId, otherStudent.id);
  const labId = repo.createLab(ta, {
    classId,
    statement: "Return zero.",
    deadline: new Date(start + 60_000).toISOString(),
    tests: [{ input: "", expectedOutput: "" }],
    constraints: [
      { id: "C1", text: "Do not use `goto`.", deductionTenths: 30 },
      { id: "C2", text: "Return normally.", deductionTenths: 20 },
    ],
  });
  t.after(() => {
    for (const connection of connections) connection.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const connect = () => {
    const connection = new WorkflowRepository(path);
    connections.push(connection);
    return connection;
  };
  return { repo, path, labId, connect };
}

function evaluations(violation = false): ConstraintEvaluation[] {
  return [
    {
      constraintId: "C1",
      verdict: violation ? "violation" : "pass",
      source: "hard-rule",
      evidence: violation ? [{ line: 2, text: "  return 0;" }] : [],
    },
    { constraintId: "C2", verdict: "pass", source: "model", evidence: [] },
  ];
}

function submit(repo: WorkflowRepository, labId: number, key = "request-1") {
  return repo.submit(student, labId, { source, idempotencyKey: key }, start);
}

function claimed(repo: WorkflowRepository, now = start) {
  const claim = repo.claimJob("worker-1", { now, leaseMs: 1000 });
  assert.ok(claim);
  return claim;
}

function checked(repo: WorkflowRepository, labId: number, violation = false) {
  const receipt = submit(repo, labId);
  const claim = claimed(repo);
  repo.recordJudgeResult(claim, { judgeStatus: "AC", tests: ["AC"] }, start);
  assert.equal(
    repo.completeChecking(claim, evaluations(violation), start),
    true,
  );
  return { receipt, claim };
}

test("migration upgrades an existing PA2 file without changing its rows or receipt", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-migrate-"));
  const path = join(directory, "legacy.db");
  const old = new DatabaseSync(path);
  old.exec(schema);
  old.exec(`INSERT INTO labs VALUES (1, 10, '2026-01-01T00:00:00.000Z');
    INSERT INTO ta_classes VALUES ('ta-a', 10);
    INSERT INTO counted_submissions VALUES (11, 1, 'old-student', 'AC', 70);
    INSERT INTO publications VALUES (1, '{"original":true}');`);
  old.close();
  const migrated = new WorkflowRepository(path);
  assert.equal(
    migrated.db.prepare("SELECT receipt FROM publications").get()?.receipt,
    '{"original":true}',
  );
  assert.equal(
    migrated.db.prepare("SELECT score_tenths FROM counted_submissions").get()
      ?.score_tenths,
    70,
  );
  migrated.close();
  const reopened = new WorkflowRepository(path);
  assert.equal(
    reopened.db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n,
    2,
  );
  reopened.close();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
});

test("submission admission atomically stores source, lab data, head and durable job", (t) => {
  const { repo, connect, labId } = fixture(t);
  const receipt = submit(repo, labId);
  const reopened = connect();
  assert.equal(
    reopened.getSubmissionForStudent(student, receipt.submissionId).status,
    "queued",
  );
  assert.equal(
    reopened.getSubmissionForStudent(student, receipt.submissionId)
      .judgeVerdict,
    null,
  );
  const claim = claimed(reopened);
  assert.equal(claim.source, source);
  assert.equal(claim.statement, "Return zero.");
  assert.equal(claim.constraints.length, 2);
  assert.equal(claim.tests[0]?.expectedOutput, "");
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM counted_heads").get()?.n,
    1,
  );
});

test("idempotency survives another connection and conflicts cannot mutate data", (t) => {
  const { repo, connect, labId } = fixture(t);
  const first = submit(repo, labId);
  const second = connect();
  assert.deepEqual(submit(second, labId), first);
  assert.throws(
    () =>
      second.submit(
        student,
        labId,
        { source: "different", idempotencyKey: "request-1" },
        start,
      ),
    /idempotency-conflict/,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM submissions").get()?.n,
    1,
  );
  assert.equal(repo.db.prepare("SELECT COUNT(*) AS n FROM jobs").get()?.n, 1);
});

test("admission failure rolls back receipt, source and counted head", (t) => {
  const { repo, labId } = fixture(t);
  repo.db.exec(
    "CREATE TRIGGER fail_enqueue BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'queue unavailable'); END",
  );
  assert.throws(() => submit(repo, labId), /queue unavailable/);
  for (const table of [
    "submissions",
    "submission_requests",
    "counted_submissions",
    "counted_heads",
    "jobs",
  ]) {
    assert.equal(
      repo.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n,
      0,
    );
  }
  repo.db.exec("DROP TRIGGER fail_enqueue");
  assert.equal(submit(repo, labId).status, "queued");
});

test("new admission stops at the deadline but an authorized receipt can replay", (t) => {
  const { repo, labId } = fixture(t);
  const first = submit(repo, labId);
  assert.deepEqual(
    repo.submit(
      student,
      labId,
      { source, idempotencyKey: "request-1" },
      start + 60_000,
    ),
    first,
  );
  assert.throws(
    () => repo.submit(student, labId, { source }, start + 60_000),
    /deadline-passed/,
  );
  repo.db
    .prepare("DELETE FROM enrollments WHERE student_id = ?")
    .run(student.id);
  assert.throws(() => submit(repo, labId), /requested resource was not found/i);
});

test("separate connections claim once; expired leases recover with a new fenced attempt", (t) => {
  const { repo, connect, labId } = fixture(t);
  submit(repo, labId);
  const first = claimed(repo);
  const second = connect();
  assert.equal(
    second.claimJob("worker-2", { now: start, leaseMs: 1000 }),
    null,
  );
  const recovered = second.claimJob("worker-2", {
    now: start + 1000,
    leaseMs: 1000,
  });
  assert.ok(recovered);
  assert.equal(recovered.submissionId, first.submissionId);
  assert.equal(recovered.attemptNumber, 2);
  assert.notEqual(recovered.leaseToken, first.leaseToken);
  assert.throws(
    () =>
      repo.recordJudgeResult(
        first,
        { judgeStatus: "WA", tests: ["WA"] },
        start + 1001,
      ),
    /lease-lost/,
  );
  assert.equal(
    repo.db
      .prepare("SELECT outcome FROM attempts WHERE id = ?")
      .get(first.attemptId)?.outcome,
    "lease_expired",
  );
});

test("heartbeats extend a current lease but cannot resurrect an expired lease", (t) => {
  const { repo, labId } = fixture(t);
  submit(repo, labId);
  const claim = claimed(repo);
  assert.equal(repo.renewLease(claim, start + 900, 1000), true);
  assert.equal(
    repo.claimJob("other", { now: start + 1100, leaseMs: 1000 }),
    null,
  );
  assert.equal(repo.renewLease(claim, start + 1900, 1000), false);
});

test("sandbox infrastructure errors retry without fabricating a student verdict", (t) => {
  const { repo, labId } = fixture(t);
  const receipt = submit(repo, labId);
  const first = claimed(repo);
  repo.retryJob(first, "sandbox_unavailable", start, 100);
  assert.equal(
    repo.getSubmissionForStudent(student, receipt.submissionId).judgeVerdict,
    null,
  );
  assert.equal(
    repo.getSubmissionForStudent(student, receipt.submissionId).status,
    "retrying",
  );
  assert.equal(
    repo.claimJob("other", { now: start + 99, leaseMs: 1000 }),
    null,
  );
  const retry = claimed(repo, start + 100);
  assert.equal(retry.attemptNumber, 2);
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM submissions").get()?.n,
    1,
  );
});

test("exhausted infrastructure retries remain failed processing and block Publish", (t) => {
  const { repo, labId } = fixture(t);
  const receipt = submit(repo, labId);
  for (let i = 0; i < 3; i++)
    repo.retryJob(claimed(repo), "sandbox_unavailable", start, 0);
  assert.equal(repo.claimJob("other", { now: start, leaseMs: 1000 }), null);
  const status = repo.getSubmissionForStudent(student, receipt.submissionId);
  assert.equal(status.status, "failed");
  assert.equal(status.judgeVerdict, null);
  assert.throws(
    () => repo.publish(labId, ta, new Date(start + 60_000)),
    /still being judged/,
  );
});

test("non-AC finishes without invoking or initializing a model verdict set", (t) => {
  const { repo, labId } = fixture(t);
  submit(repo, labId);
  repo.recordJudgeResult(
    claimed(repo),
    { judgeStatus: "WA", tests: ["WA"] },
    start,
  );
  assert.equal(
    repo.db.prepare("SELECT state FROM jobs").get()?.state,
    "completed",
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
    0,
  );
  assert.equal(repo.getReviewQueue(ta, labId).items.length, 0);
  assert.equal(
    JSON.parse(repo.publish(labId, ta, new Date(start + 60_000)).receipt)
      .submissionCount,
    1,
  );
});

test("AC with checker pending blocks Publish even before review rows exist", (t) => {
  const { repo, labId } = fixture(t);
  submit(repo, labId);
  repo.recordJudgeResult(
    claimed(repo),
    { judgeStatus: "AC", tests: ["AC"] },
    start,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM review_items").get()?.n,
    0,
  );
  assert.throws(
    () => repo.publish(labId, ta, new Date(start + 60_000)),
    /reviews are not complete/i,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM publications").get()?.n,
    0,
  );
});

test("atomic verdict persistence rolls back all rows and duplicate completion never overwrites", (t) => {
  const { repo, labId } = fixture(t);
  submit(repo, labId);
  const claim = claimed(repo);
  repo.recordJudgeResult(claim, { judgeStatus: "AC", tests: ["AC"] }, start);
  repo.db.exec(
    "CREATE TRIGGER fail_verdict BEFORE INSERT ON verdicts WHEN NEW.constraint_id = 'C2' BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END",
  );
  assert.throws(
    () => repo.completeChecking(claim, evaluations(), start),
    /storage unavailable/,
  );
  for (const table of ["verdict_sets", "verdicts", "reviews", "review_items"]) {
    assert.equal(
      repo.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n,
      0,
    );
  }
  repo.db.exec("DROP TRIGGER fail_verdict");
  assert.equal(repo.completeChecking(claim, evaluations(), start), true);
  assert.equal(repo.completeChecking(claim, evaluations(true), start), false);
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
    1,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM verdicts").get()?.n,
    2,
  );
  assert.equal(
    repo.db
      .prepare("SELECT verdict FROM verdicts WHERE constraint_id = 'C1'")
      .get()?.verdict,
    "pass",
  );
});

test("incomplete or duplicate checker constraints cannot initialize reviews", (t) => {
  const { repo, labId } = fixture(t);
  submit(repo, labId);
  const claim = claimed(repo);
  repo.recordJudgeResult(claim, { judgeStatus: "AC", tests: ["AC"] }, start);
  assert.throws(
    () => repo.completeChecking(claim, evaluations().slice(0, 1), start),
    /invalid-checker-result/,
  );
  assert.throws(
    () =>
      repo.completeChecking(
        claim,
        [evaluations()[0]!, evaluations()[0]!],
        start,
      ),
    /invalid-checker-result/,
  );
  const bad = evaluations(true);
  bad[0]!.evidence = [{ line: 2, text: "invented line" }];
  assert.throws(
    () => repo.completeChecking(claim, bad, start),
    /invalid-checker-result/,
  );
  assert.equal(repo.getReviewQueue(ta, labId).items.length, 0);
});

test("TA review records evidence and audit; only configured deductions prepare marks", (t) => {
  const { repo, labId } = fixture(t);
  checked(repo, labId, true);
  const items = repo.getReviewQueue(ta, labId).items;
  assert.equal(items[0]?.deductionTenths, 30);
  assert.throws(
    () => repo.publish(labId, ta, new Date(start + 60_000)),
    /reviews are not complete/i,
  );
  for (const item of items) {
    repo.reviewConstraint(
      ta,
      item.reviewId,
      {
        decision: item.verdict === "violation" ? "violation" : "pass",
        evidence: item.evidence,
        reason: "Read the original code.",
        expectedVersion: 0,
        ...{ deductionTenths: 99 },
      },
      start,
    );
  }
  assert.equal(
    repo.db.prepare("SELECT score_tenths FROM counted_submissions").get()
      ?.score_tenths,
    70,
  );
  repo.publish(labId, ta, new Date(start + 60_000));
  assert.equal(
    repo.db.prepare("SELECT score_tenths FROM published_marks").get()
      ?.score_tenths,
    70,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM review_audit").get()?.n,
    2,
  );
  assert.throws(
    () =>
      repo.reviewConstraint(
        ta,
        items[0]!.reviewId,
        { decision: "pass", evidence: [], reason: "late", expectedVersion: 1 },
        start,
      ),
    /already-published/,
  );
});

test("review ownership and optimistic versions deny updates without side effects", (t) => {
  const { repo, labId } = fixture(t);
  checked(repo, labId);
  const item = repo.getReviewQueue(ta, labId).items[0]!;
  const decision = {
    decision: "pass" as const,
    evidence: [],
    reason: "Reviewed",
    expectedVersion: 0,
  };
  assert.throws(
    () => repo.getReviewQueue(foreign, labId),
    /requested resource was not found/i,
  );
  assert.throws(
    () => repo.reviewConstraint(foreign, item.reviewId, decision, start),
    /requested resource was not found/i,
  );
  assert.throws(
    () => repo.reviewConstraint(student, item.reviewId, decision, start),
    /assigned TA/i,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM review_audit").get()?.n,
    0,
  );
  repo.reviewConstraint(ta, item.reviewId, decision, start);
  assert.throws(
    () => repo.reviewConstraint(ta, item.reviewId, decision, start),
    /review-conflict/,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM review_audit").get()?.n,
    1,
  );
});

test("a late old result cannot replace a newer counted submission", (t) => {
  const { repo, labId } = fixture(t);
  const old = submit(repo, labId);
  const oldClaim = claimed(repo);
  const current = repo.submit(
    student,
    labId,
    { source: source + "\n", idempotencyKey: "request-2" },
    start + 1,
  );
  repo.recordJudgeResult(
    oldClaim,
    { judgeStatus: "AC", tests: ["AC"] },
    start + 2,
  );
  repo.completeChecking(oldClaim, evaluations(), start + 2);
  assert.equal(repo.getReviewQueue(ta, labId).items.length, 0);
  const newClaim = claimed(repo, start + 2);
  repo.recordJudgeResult(
    newClaim,
    { judgeStatus: "WA", tests: ["WA"] },
    start + 2,
  );
  assert.equal(
    repo.getSubmissionForStudent(student, old.submissionId).judgeVerdict,
    "AC",
  );
  assert.equal(
    repo.getSubmissionForStudent(student, current.submissionId).judgeVerdict,
    "WA",
  );
  assert.equal(
    repo.db.prepare("SELECT judge_status FROM counted_submissions").get()
      ?.judge_status,
    "WA",
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM counted_submissions").get()?.n,
    1,
  );
  assert.throws(
    () => repo.getSubmissionForStudent(otherStudent, current.submissionId),
    /requested resource was not found/i,
  );
});

test("deleting initialized review rows fails closed instead of publishing an empty queue", (t) => {
  const { repo, labId } = fixture(t);
  checked(repo, labId);
  repo.db.exec("DELETE FROM review_items; DELETE FROM reviews;");
  assert.throws(
    () => repo.publish(labId, ta, new Date(start + 60_000)),
    /reviews are not complete/i,
  );
});

test("a recovered AC job resumes checking without losing its persisted judge result", (t) => {
  const { repo, connect, labId } = fixture(t);
  submit(repo, labId);
  const initial = claimed(repo);
  repo.recordJudgeResult(initial, { judgeStatus: "AC", tests: ["AC"] }, start);
  const recovered = connect().claimJob("replacement", {
    now: start + 1000,
    leaseMs: 1000,
  });
  assert.ok(recovered);
  assert.deepEqual(recovered.judgeResult, { judgeStatus: "AC", tests: ["AC"] });
  assert.throws(
    () => repo.completeChecking(initial, evaluations(), start + 1000),
    /lease-lost/,
  );
  repo.completeChecking(recovered, evaluations(), start + 1001);
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
    1,
  );
});

test("an incomplete or contradictory AC result cannot advance the pipeline", (t) => {
  const { repo, labId } = fixture(t);
  const receipt = submit(repo, labId);
  const claim = claimed(repo);
  for (const tests of [[], ["WA" as const], ["AC" as const, "AC" as const]]) {
    assert.throws(
      () => repo.recordJudgeResult(claim, { judgeStatus: "AC", tests }, start),
      /invalid-input/,
    );
  }
  assert.equal(
    repo.getSubmissionForStudent(student, receipt.submissionId).judgeVerdict,
    null,
  );
});

test("admission size and unauthorized class creation fail without creating jobs", (t) => {
  const { repo, labId } = fixture(t);
  assert.throws(
    () => repo.submit(student, labId, { source: "é".repeat(32769) }, start),
    /invalid-input/,
  );
  assert.throws(
    () => repo.createClass(student, "unauthorized"),
    /assigned TA/i,
  );
  assert.equal(repo.db.prepare("SELECT COUNT(*) AS n FROM jobs").get()?.n, 0);
  repo.submit(student, labId, { source: "a".repeat(65536) }, start);
  assert.equal(repo.db.prepare("SELECT COUNT(*) AS n FROM jobs").get()?.n, 1);
});

test("new classes never reuse a legacy class ID and inherit its private labs", (t) => {
  const { repo } = fixture(t);
  repo.db.exec(
    "INSERT INTO labs VALUES (999, 3, '2026-01-01T00:00:00.000Z'); INSERT INTO ta_classes VALUES ('legacy-ta', 3)",
  );
  const newClass = repo.createClass(admin, "New unrelated class");
  repo.assignTa(admin, newClass, foreign.id);
  assert.notEqual(newClass, 3);
  assert.throws(
    () => repo.getReviewQueue(foreign, 999),
    /requested resource was not found/i,
  );
});
