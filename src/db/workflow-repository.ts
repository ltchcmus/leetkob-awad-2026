import { createHash, randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import { PublicationRepository } from "../repository.ts";
import type { Principal } from "../repository.ts";
import { Problem } from "../problem.ts";
import { WorkflowError } from "../queue/types.ts";
import type {
  Claim,
  Constraint,
  ConstraintEvaluation,
  EvidenceLine,
  JudgeResult,
  JudgeVerdict,
  LabTest,
  Limits,
  ReviewDecision,
  ReviewItem,
  StudentStatus,
  SubmissionReceipt,
} from "../queue/types.ts";

const judgeVerdicts = new Set(["AC", "WA", "TLE", "MLE", "RE", "CE"]);
type SubmissionRow = {
  id: string;
  lab_id: number;
  counted_id: number;
  source: string;
  received_at: number;
  judge_status: JudgeVerdict | null;
  test_results: string;
};
type JobRow = {
  id: string;
  submission_id: string;
  state: string;
  attempt_count: number;
  max_attempts: number;
  lease_token: string | null;
  lease_expires_at: number | null;
};

export class WorkflowRepository extends PublicationRepository {
  private one<T>(sql: string, ...parameters: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...parameters) as unknown as T | undefined;
  }

  private all<T>(sql: string, ...parameters: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...parameters) as unknown as T[];
  }

  private write<T>(action: () => T): T {
    try {
      this.db.exec("BEGIN IMMEDIATE");
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      if (
        error instanceof Error &&
        "errcode" in error &&
        (error.errcode === 5 || error.errcode === 6)
      )
        throw new Problem("publication-unavailable");
      throw error;
    }
  }

  private role(actor: Principal, role: Principal["role"]): void {
    if (actor.role !== role) throw new Problem("forbidden");
  }

  private ownedClass(actor: Principal, classId: number): void {
    this.role(actor, "ta");
    if (
      !this.one(
        "SELECT 1 FROM ta_classes WHERE ta_id = ? AND class_id = ?",
        actor.id,
        classId,
      )
    )
      throw new Problem("not-found");
  }

  private requireOwnedLab(actor: Principal, labId: number): void {
    this.role(actor, "ta");
    if (
      !this.one(
        "SELECT 1 FROM labs l JOIN ta_classes t ON t.class_id = l.class_id WHERE l.id = ? AND t.ta_id = ?",
        labId,
        actor.id,
      )
    )
      throw new Problem("not-found");
  }

  // Trusted bootstrap only; HTTP authentication/credential storage belongs to the API adapter.
  provisionUser(principal: Principal): void {
    if (
      !principal.id ||
      principal.id.length > 200 ||
      !["admin", "ta", "student"].includes(principal.role)
    )
      throw new WorkflowError("invalid-input");
    this.db
      .prepare(
        "INSERT INTO users (id, role) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
      )
      .run(principal.id, principal.role);
    if (
      this.one<{ role: string }>(
        "SELECT role FROM users WHERE id = ?",
        principal.id,
      )?.role !== principal.role
    )
      throw new WorkflowError("invalid-input");
  }

  createClass(actor: Principal, name: string): number {
    this.role(actor, "admin");
    if (!name.trim() || name.length > 200)
      throw new WorkflowError("invalid-input");
    return Number(
      this.db.prepare("INSERT INTO classes (name) VALUES (?)").run(name)
        .lastInsertRowid,
    );
  }

  assignTa(actor: Principal, classId: number, taId: string): void {
    this.role(actor, "admin");
    if (
      !this.one("SELECT 1 FROM classes WHERE id = ?", classId) ||
      !this.one("SELECT 1 FROM users WHERE id = ? AND role = 'ta'", taId)
    )
      throw new Problem("not-found");
    this.db
      .prepare("INSERT OR IGNORE INTO ta_classes VALUES (?, ?)")
      .run(taId, classId);
  }

  enrollStudent(actor: Principal, classId: number, studentId: string): void {
    this.write(() => {
      if (actor.role !== "admin") this.ownedClass(actor, classId);
      if (
        !this.one("SELECT 1 FROM classes WHERE id = ?", classId) ||
        !this.one(
          "SELECT 1 FROM users WHERE id = ? AND role = 'student'",
          studentId,
        )
      )
        throw new Problem("not-found");
      this.db
        .prepare("INSERT OR IGNORE INTO enrollments VALUES (?, ?)")
        .run(classId, studentId);
    });
  }

  createLab(
    actor: Principal,
    input: {
      classId: number;
      statement: string;
      deadline: string;
      tests: LabTest[];
      constraints: Constraint[];
      cpuMs?: number;
      memoryMb?: number;
    },
  ): number {
    return this.write(() => {
      this.ownedClass(actor, input.classId);
      const cpuMs = input.cpuMs ?? 1000;
      const memoryMb = input.memoryMb ?? 256;
      if (
        !input.statement.trim() ||
        !Number.isFinite(Date.parse(input.deadline)) ||
        new Date(input.deadline).toISOString() !== input.deadline ||
        !input.tests.length ||
        input.tests.length > 100 ||
        !input.constraints.length ||
        input.constraints.length > 100 ||
        !Number.isInteger(cpuMs) ||
        cpuMs < 1000 ||
        cpuMs > 5000 ||
        !Number.isInteger(memoryMb) ||
        memoryMb < 64 ||
        memoryMb > 512 ||
        new Set(input.constraints.map((c) => c.id)).size !==
          input.constraints.length ||
        input.constraints.some(
          (c) =>
            !c.id ||
            !c.text.trim() ||
            !Number.isInteger(c.deductionTenths) ||
            c.deductionTenths < 0 ||
            c.deductionTenths > 100,
        ) ||
        input.tests.some(
          (test) =>
            typeof test.input !== "string" ||
            typeof test.expectedOutput !== "string",
        )
      )
        throw new WorkflowError("invalid-input");
      const labId = Number(
        this.db
          .prepare("INSERT INTO labs (class_id, deadline) VALUES (?, ?)")
          .run(input.classId, input.deadline).lastInsertRowid,
      );
      this.db
        .prepare(
          "INSERT INTO lab_details VALUES (?, ?, ?, ?, ?, 16, 1048576, 10000)",
        )
        .run(labId, input.statement, cpuMs, cpuMs * 3, memoryMb);
      input.constraints.forEach((c, i) =>
        this.db
          .prepare("INSERT INTO lab_constraints VALUES (?, ?, ?, ?, ?)")
          .run(labId, c.id, c.text, c.deductionTenths, i),
      );
      input.tests.forEach((test, i) =>
        this.db
          .prepare("INSERT INTO lab_tests VALUES (?, ?, ?, ?)")
          .run(labId, i, test.input, test.expectedOutput),
      );
      return labId;
    });
  }

  submit(
    actor: Principal,
    labId: number,
    input: { source: string; idempotencyKey?: string },
    now: number,
  ): SubmissionReceipt {
    return this.write(() => {
      this.role(actor, "student");
      const lab = this.one<{ deadline: string }>(
        "SELECT l.deadline FROM labs l JOIN enrollments e ON e.class_id = l.class_id JOIN lab_details d ON d.lab_id = l.id WHERE l.id = ? AND e.student_id = ?",
        labId,
        actor.id,
      );
      if (!lab) throw new Problem("not-found");
      if (
        typeof input.source !== "string" ||
        !input.source.length ||
        Buffer.byteLength(input.source, "utf8") > 65536 ||
        !Number.isSafeInteger(now) ||
        (input.idempotencyKey !== undefined &&
          !/^[\x21-\x7e]{1,200}$/.test(input.idempotencyKey))
      )
        throw new WorkflowError("invalid-input");
      const hash = createHash("sha256").update(input.source).digest("hex");
      if (input.idempotencyKey !== undefined) {
        const previous = this.one<{ request_hash: string; receipt: string }>(
          "SELECT request_hash, receipt FROM submission_requests WHERE student_id = ? AND lab_id = ? AND idempotency_key = ?",
          actor.id,
          labId,
          input.idempotencyKey,
        );
        if (previous) {
          if (previous.request_hash !== hash)
            throw new WorkflowError("idempotency-conflict");
          return JSON.parse(previous.receipt) as SubmissionReceipt;
        }
      }
      if (now >= Date.parse(lab.deadline))
        throw new WorkflowError("deadline-passed");
      if (this.one("SELECT 1 FROM publications WHERE lab_id = ?", labId))
        throw new WorkflowError("already-published");
      let counted = this.one<{ id: number }>(
        "SELECT id FROM counted_submissions WHERE lab_id = ? AND student_id = ?",
        labId,
        actor.id,
      );
      if (!counted) {
        counted = {
          id: Number(
            this.db
              .prepare(
                "INSERT INTO counted_submissions (lab_id, student_id, judge_status, score_tenths) VALUES (?, ?, 'queued', 0)",
              )
              .run(labId, actor.id).lastInsertRowid,
          ),
        };
      }
      const sequence = this.one<{ n: number }>(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM submissions WHERE lab_id = ? AND student_id = ?",
        labId,
        actor.id,
      )!.n;
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO submissions (id, lab_id, student_id, counted_id, sequence, source, source_hash, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          labId,
          actor.id,
          counted.id,
          sequence,
          input.source,
          hash,
          now,
        );
      this.db
        .prepare(
          "INSERT INTO counted_heads VALUES (?, ?) ON CONFLICT (counted_id) DO UPDATE SET submission_id = excluded.submission_id",
        )
        .run(counted.id, id);
      this.db
        .prepare(
          "UPDATE counted_submissions SET judge_status = 'queued', score_tenths = 0 WHERE id = ?",
        )
        .run(counted.id);
      this.db
        .prepare("DELETE FROM review_items WHERE submission_id = ?")
        .run(counted.id);
      this.db
        .prepare(
          "INSERT INTO jobs (id, submission_id, state, available_at) VALUES (?, ?, 'queued', ?)",
        )
        .run(randomUUID(), id, now);
      const receipt: SubmissionReceipt = {
        submissionId: id,
        status: "queued",
        createdAt: new Date(now).toISOString(),
      };
      if (input.idempotencyKey !== undefined)
        this.db
          .prepare("INSERT INTO submission_requests VALUES (?, ?, ?, ?, ?, ?)")
          .run(
            actor.id,
            labId,
            input.idempotencyKey,
            hash,
            id,
            JSON.stringify(receipt),
          );
      return receipt;
    });
  }

  private recoverExpired(now: number): void {
    this.db
      .prepare(
        "UPDATE attempts SET outcome = 'lease_expired', finished_at = ? WHERE outcome = 'active' AND job_id IN (SELECT id FROM jobs WHERE state = 'leased' AND lease_expires_at <= ?)",
      )
      .run(now, now);
    this.db
      .prepare(
        "UPDATE jobs SET state = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END, available_at = ?, lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL, last_error_code = 'lease_expired' WHERE state = 'leased' AND lease_expires_at <= ?",
      )
      .run(now, now);
  }

  claimJob(
    workerId: string,
    options: { now: number; leaseMs: number },
  ): Claim | null {
    const { now, leaseMs } = options;
    if (
      !workerId ||
      workerId.length > 200 ||
      !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(leaseMs) ||
      leaseMs < 100 ||
      leaseMs > 3_600_000
    )
      throw new WorkflowError("invalid-input");
    return this.write(() => {
      this.recoverExpired(now);
      const job = this.one<JobRow>(
        "SELECT * FROM jobs WHERE state IN ('queued','retry_wait') AND available_at <= ? AND attempt_count < max_attempts ORDER BY available_at, id LIMIT 1",
        now,
      );
      if (!job) return null;
      const leaseToken = randomUUID();
      const attemptId = randomUUID();
      const attemptNumber = job.attempt_count + 1;
      this.db
        .prepare(
          "UPDATE jobs SET state = 'leased', attempt_count = ?, lease_token = ?, lease_owner = ?, lease_expires_at = ? WHERE id = ?",
        )
        .run(attemptNumber, leaseToken, workerId, now + leaseMs, job.id);
      this.db
        .prepare(
          "INSERT INTO attempts (id, job_id, number, lease_token, worker_id, started_at, outcome) VALUES (?, ?, ?, ?, ?, ?, 'active')",
        )
        .run(attemptId, job.id, attemptNumber, leaseToken, workerId, now);
      const submission = this.submission(job.submission_id);
      if (submission.judge_status === null && this.current(submission))
        this.db
          .prepare(
            "UPDATE counted_submissions SET judge_status = 'running' WHERE id = ?",
          )
          .run(submission.counted_id);
      const details = this.one<{
        statement: string;
        cpu_ms: number;
        wall_ms: number;
        memory_mb: number;
        processes: number;
        output_bytes: number;
        compile_ms: number;
      }>("SELECT * FROM lab_details WHERE lab_id = ?", submission.lab_id)!;
      const limits: Limits = {
        cpuMs: details.cpu_ms,
        wallMs: details.wall_ms,
        memoryMb: details.memory_mb,
        processes: details.processes,
        outputBytes: details.output_bytes,
        compileMs: details.compile_ms,
      };
      return {
        jobId: job.id,
        submissionId: submission.id,
        labId: submission.lab_id,
        attemptId,
        attemptNumber,
        leaseToken,
        leaseExpiresAt: now + leaseMs,
        source: submission.source,
        statement: details.statement,
        tests: this.all<LabTest>(
          "SELECT input, expected_output AS expectedOutput FROM lab_tests WHERE lab_id = ? ORDER BY position",
          submission.lab_id,
        ),
        constraints: this.constraints(submission.lab_id),
        limits,
        judgeResult:
          submission.judge_status === null
            ? null
            : {
                judgeStatus: submission.judge_status,
                tests: JSON.parse(submission.test_results) as JudgeVerdict[],
              },
      };
    });
  }

  renewLease(claim: Claim, now: number, leaseMs: number): boolean {
    if (
      !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(leaseMs) ||
      leaseMs < 100 ||
      leaseMs > 3_600_000
    )
      throw new WorkflowError("invalid-input");
    return (
      this.db
        .prepare(
          "UPDATE jobs SET lease_expires_at = ? WHERE id = ? AND submission_id = ? AND state = 'leased' AND lease_token = ? AND lease_expires_at > ?",
        )
        .run(
          now + leaseMs,
          claim.jobId,
          claim.submissionId,
          claim.leaseToken,
          now,
        ).changes === 1
    );
  }

  private active(claim: Claim, now: number): JobRow {
    const job = this.one<JobRow>(
      "SELECT * FROM jobs WHERE id = ? AND submission_id = ?",
      claim.jobId,
      claim.submissionId,
    );
    if (
      !job ||
      job.state !== "leased" ||
      job.lease_token !== claim.leaseToken ||
      job.lease_expires_at === null ||
      job.lease_expires_at <= now
    )
      throw new WorkflowError("lease-lost");
    return job;
  }

  private submission(id: string): SubmissionRow {
    const submission = this.one<SubmissionRow>(
      "SELECT * FROM submissions WHERE id = ?",
      id,
    );
    if (!submission) throw new Problem("not-found");
    return submission;
  }

  private constraints(labId: number): Constraint[] {
    return this.all(
      "SELECT constraint_id AS id, text, deduction_tenths AS deductionTenths FROM lab_constraints WHERE lab_id = ? ORDER BY position",
      labId,
    );
  }

  private current(submission: SubmissionRow): boolean {
    return !!this.one(
      "SELECT 1 FROM counted_heads WHERE counted_id = ? AND submission_id = ?",
      submission.counted_id,
      submission.id,
    );
  }

  retryJob(claim: Claim, code: string, now: number, delayMs = 1000): void {
    if (
      !/^[a-z0-9_]{1,80}$/.test(code) ||
      !Number.isSafeInteger(delayMs) ||
      delayMs < 0 ||
      delayMs > 3_600_000
    )
      throw new WorkflowError("invalid-input");
    this.write(() => {
      const job = this.active(claim, now);
      this.db
        .prepare(
          "UPDATE attempts SET outcome = 'infrastructure_error', finished_at = ?, error_code = ? WHERE lease_token = ?",
        )
        .run(now, code, claim.leaseToken);
      this.db
        .prepare(
          "UPDATE jobs SET state = ?, available_at = ?, lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL, last_error_code = ? WHERE id = ?",
        )
        .run(
          job.attempt_count >= job.max_attempts ? "failed" : "retry_wait",
          now + delayMs,
          code,
          claim.jobId,
        );
    });
  }

  private finish(claim: Claim, now: number): void {
    this.db
      .prepare(
        "UPDATE attempts SET outcome = 'completed', finished_at = ? WHERE lease_token = ?",
      )
      .run(now, claim.leaseToken);
    this.db
      .prepare(
        "UPDATE jobs SET state = 'completed', lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL WHERE id = ?",
      )
      .run(claim.jobId);
  }

  recordJudgeResult(claim: Claim, result: JudgeResult, now: number): void {
    if (
      !judgeVerdicts.has(result.judgeStatus) ||
      !Array.isArray(result.tests) ||
      result.tests.some((v) => !judgeVerdicts.has(v))
    )
      throw new WorkflowError("invalid-input");
    this.write(() => {
      this.active(claim, now);
      const submission = this.submission(claim.submissionId);
      if (submission.judge_status !== null)
        throw new WorkflowError("invalid-input");
      const accepted = result.judgeStatus === "AC";
      if (
        accepted &&
        (result.tests.length !==
          this.one<{ n: number }>(
            "SELECT COUNT(*) AS n FROM lab_tests WHERE lab_id = ?",
            submission.lab_id,
          )!.n ||
          result.tests.some((verdict) => verdict !== "AC"))
      )
        throw new WorkflowError("invalid-input");
      this.db
        .prepare(
          "UPDATE submissions SET judge_status = ?, test_results = ?, checker_status = ?, review_initialized = ? WHERE id = ?",
        )
        .run(
          result.judgeStatus,
          JSON.stringify(result.tests),
          accepted ? "running" : "not_required",
          accepted ? 0 : 1,
          submission.id,
        );
      if (this.current(submission))
        this.db
          .prepare(
            "UPDATE counted_submissions SET judge_status = ?, score_tenths = 0 WHERE id = ?",
          )
          .run(result.judgeStatus, submission.counted_id);
      if (!accepted) this.finish(claim, now);
    });
  }

  private evidenceValid(evidence: EvidenceLine[], source: string): boolean {
    if (!Array.isArray(evidence) || evidence.length > 1000) return false;
    const lines = source.split(/\r?\n/);
    return evidence.every(
      (e) =>
        e &&
        Number.isInteger(e.line) &&
        e.line >= 1 &&
        typeof e.text === "string" &&
        lines[e.line - 1] === e.text,
    );
  }

  completeChecking(
    claim: Claim,
    evaluations: ConstraintEvaluation[],
    now: number,
  ): boolean {
    return this.write(() => {
      const existing = this.one<JobRow>(
        "SELECT * FROM jobs WHERE id = ? AND submission_id = ?",
        claim.jobId,
        claim.submissionId,
      );
      if (existing?.state === "completed") return false;
      this.active(claim, now);
      const submission = this.submission(claim.submissionId);
      const constraints = this.constraints(submission.lab_id);
      if (
        submission.judge_status !== "AC" ||
        !Array.isArray(evaluations) ||
        evaluations.length !== constraints.length ||
        evaluations.some(
          (evaluation) => evaluation === null || typeof evaluation !== "object",
        ) ||
        new Set(evaluations.map((e) => e.constraintId)).size !==
          constraints.length ||
        evaluations.some(
          (e) =>
            !constraints.some((c) => c.id === e.constraintId) ||
            !["pass", "violation", "unsure"].includes(e.verdict) ||
            !["hard-rule", "model", "guardrail"].includes(e.source) ||
            !this.evidenceValid(e.evidence, submission.source) ||
            (e.verdict === "violation" && !e.evidence.length) ||
            (e.reason !== undefined &&
              (typeof e.reason !== "string" || e.reason.length > 2000)),
        )
      )
        throw new WorkflowError("invalid-checker-result");
      this.db
        .prepare("INSERT INTO verdict_sets VALUES (?, ?, ?)")
        .run(submission.id, claim.attemptId, now);
      for (const evaluation of evaluations) {
        this.db
          .prepare("INSERT INTO verdicts VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(
            submission.id,
            submission.lab_id,
            evaluation.constraintId,
            evaluation.verdict,
            evaluation.source,
            JSON.stringify(evaluation.evidence),
            evaluation.reason ?? null,
          );
        this.db
          .prepare(
            "INSERT INTO reviews (id, submission_id, constraint_id) VALUES (?, ?, ?)",
          )
          .run(randomUUID(), submission.id, evaluation.constraintId);
        if (this.current(submission))
          this.db
            .prepare(
              "INSERT INTO review_items (submission_id, constraint_id, decision) VALUES (?, ?, NULL)",
            )
            .run(submission.counted_id, evaluation.constraintId);
      }
      this.db
        .prepare(
          "UPDATE submissions SET checker_status = 'complete', review_initialized = 1 WHERE id = ?",
        )
        .run(submission.id);
      this.finish(claim, now);
      return true;
    });
  }

  getSubmissionForStudent(
    actor: Principal,
    submissionId: string,
  ): StudentStatus {
    this.role(actor, "student");
    const row = this.one<SubmissionRow & { state: string }>(
      "SELECT s.*, j.state FROM submissions s JOIN jobs j ON j.submission_id = s.id JOIN labs l ON l.id = s.lab_id JOIN enrollments e ON e.class_id = l.class_id AND e.student_id = s.student_id WHERE s.id = ? AND s.student_id = ?",
      submissionId,
      actor.id,
    );
    if (!row) throw new Problem("not-found");
    const statuses: Record<string, StudentStatus["status"]> = {
      queued: "queued",
      leased: "running",
      retry_wait: "retrying",
      completed: "completed",
      failed: "failed",
    };
    return {
      submissionId,
      status: statuses[row.state]!,
      judgeVerdict: row.judge_status,
      testVerdicts: JSON.parse(row.test_results) as JudgeVerdict[],
      createdAt: new Date(row.received_at).toISOString(),
    };
  }

  getReviewQueue(actor: Principal, labId: number): { items: ReviewItem[] } {
    this.requireOwnedLab(actor, labId);
    const rows = this.all<Omit<ReviewItem, "evidence"> & { evidence: string }>(
      `SELECT r.id AS reviewId, r.submission_id AS submissionId, r.constraint_id AS constraintId, c.text AS constraintText, c.deduction_tenths AS deductionTenths, v.verdict, v.evidence, v.reason, r.decision, r.version AS reviewVersion
      FROM reviews r JOIN submissions s ON s.id = r.submission_id
      JOIN counted_heads h ON h.submission_id = s.id
      JOIN verdicts v ON v.submission_id = s.id AND v.constraint_id = r.constraint_id
      JOIN lab_constraints c ON c.lab_id = s.lab_id AND c.constraint_id = r.constraint_id
      WHERE s.lab_id = ? ORDER BY s.received_at, s.id, c.position`,
      labId,
    );
    return {
      items: rows.map((row) => ({
        ...row,
        evidence: JSON.parse(row.evidence) as EvidenceLine[],
      })),
    };
  }

  reviewConstraint(
    actor: Principal,
    reviewId: string,
    input: ReviewDecision,
    now: number,
  ): void {
    this.write(() => {
      this.role(actor, "ta");
      const review = this.one<{
        submission_id: string;
        constraint_id: string;
        version: number;
        decision: string | null;
      }>("SELECT * FROM reviews WHERE id = ?", reviewId);
      if (!review) throw new Problem("not-found");
      const submission = this.submission(review.submission_id);
      this.requireOwnedLab(actor, submission.lab_id);
      if (
        this.one(
          "SELECT 1 FROM publications WHERE lab_id = ?",
          submission.lab_id,
        )
      )
        throw new WorkflowError("already-published");
      if (!this.current(submission))
        throw new WorkflowError("stale-submission");
      if (review.version !== input.expectedVersion)
        throw new WorkflowError("review-conflict");
      if (
        !["pass", "violation"].includes(input.decision) ||
        !this.evidenceValid(input.evidence, submission.source) ||
        (input.decision === "violation" && !input.evidence.length) ||
        !input.reason.trim() ||
        input.reason.length > 2000 ||
        !Number.isSafeInteger(now)
      )
        throw new WorkflowError("invalid-input");
      const evidence = JSON.stringify(input.evidence);
      this.db
        .prepare(
          "UPDATE reviews SET decision = ?, evidence = ?, reason = ?, reviewer_id = ?, reviewed_at = ?, version = version + 1 WHERE id = ?",
        )
        .run(input.decision, evidence, input.reason, actor.id, now, reviewId);
      this.db
        .prepare("INSERT INTO review_audit VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(
          randomUUID(),
          reviewId,
          actor.id,
          review.decision,
          input.decision,
          evidence,
          input.reason,
          now,
          review.version + 1,
        );
      this.db
        .prepare(
          "UPDATE review_items SET decision = ? WHERE submission_id = ? AND constraint_id = ?",
        )
        .run(input.decision, submission.counted_id, review.constraint_id);
      if (
        !this.one(
          "SELECT 1 FROM reviews WHERE submission_id = ? AND decision IS NULL",
          submission.id,
        )
      ) {
        const deductions = this.one<{ total: number }>(
          "SELECT COALESCE(SUM(c.deduction_tenths), 0) AS total FROM reviews r JOIN lab_constraints c ON c.lab_id = ? AND c.constraint_id = r.constraint_id WHERE r.submission_id = ? AND r.decision = 'violation'",
          submission.lab_id,
          submission.id,
        )!.total;
        this.db
          .prepare(
            "UPDATE counted_submissions SET score_tenths = ? WHERE id = ?",
          )
          .run(Math.max(0, 100 - deductions), submission.counted_id);
      }
    });
  }
}
