import type { DatabaseSync } from "node:sqlite";
import type { Claim } from "../queue/types.ts";
import { WorkflowError } from "../queue/types.ts";

export class AttemptPersistence {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  private write<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private fence(claim: Claim, now: number): void {
    if (
      !this.db
        .prepare(
          "SELECT 1 FROM jobs j JOIN attempts a ON a.job_id=j.id AND a.lease_token=j.lease_token WHERE j.id=? AND j.submission_id=? AND j.state='leased' AND j.lease_token=? AND j.lease_expires_at>? AND a.id=?",
        )
        .get(
          claim.jobId,
          claim.submissionId,
          claim.leaseToken,
          now,
          claim.attemptId,
        )
    )
      throw new WorkflowError("lease-lost");
  }
  start(claim: Claim, now: number): void {
    this.write(() => {
      this.fence(claim, now);
      this.db
        .prepare(
          "INSERT INTO attempt_safety(attempt_id,job_id,cleanup) VALUES (?,?,'pending')",
        )
        .run(claim.attemptId, claim.jobId);
    });
  }
  cleanup(
    claim: Claim,
    confirmed: boolean,
    retryable: boolean,
    code: string,
    now: number,
  ): void {
    if (!/^[a-z0-9_]{1,80}$/.test(code))
      throw new WorkflowError("invalid-input");
    this.write(() => {
      this.fence(claim, now);
      this.db
        .prepare(
          "UPDATE attempt_safety SET cleanup=?,retryable=?,reason=? WHERE attempt_id=?",
        )
        .run(
          confirmed && retryable ? "confirmed" : "quarantined",
          Number(retryable),
          code,
          claim.attemptId,
        );
    });
  }
  list(): Array<{ attemptId: string; jobId: string; reason: string | null }> {
    return this.db
      .prepare(
        "SELECT attempt_id AS attemptId,job_id AS jobId,reason FROM attempt_safety WHERE cleanup='quarantined'",
      )
      .all() as unknown as Array<{
      attemptId: string;
      jobId: string;
      reason: string | null;
    }>;
  }
  reconcile(
    attemptId: string,
    input: { confirmed: boolean; operator: string; now: number },
  ): void {
    if (
      !input.operator.trim() ||
      input.operator.length > 200 ||
      !Number.isSafeInteger(input.now)
    )
      throw new WorkflowError("invalid-input");
    this.write(() => {
      const row = this.db
        .prepare(
          "SELECT s.job_id,j.state,j.lease_expires_at FROM attempt_safety s JOIN jobs j ON j.id=s.job_id WHERE s.attempt_id=?",
        )
        .get(attemptId);
      if (!row) throw new WorkflowError("invalid-input");
      if (row.state === "leased" && Number(row.lease_expires_at) > input.now)
        throw new WorkflowError("lease-lost");
      this.db
        .prepare(
          "INSERT INTO cleanup_audit(attempt_id,operator,confirmed,at) VALUES (?,?,?,?)",
        )
        .run(attemptId, input.operator, Number(input.confirmed), input.now);
      if (input.confirmed)
        this.db
          .prepare(
            "UPDATE attempt_safety SET cleanup='confirmed',retryable=1 WHERE attempt_id=?",
          )
          .run(attemptId);
    });
  }
  metadata(
    claim: Claim,
    input: {
      policyVersion: string;
      sourceHash: string;
      snapshotVersion: number;
    },
    now: number,
  ): void {
    if (
      !/^[a-f0-9]{64}$/.test(input.sourceHash) ||
      input.policyVersion.length > 200 ||
      !Number.isInteger(input.snapshotVersion)
    )
      throw new WorkflowError("invalid-input");
    this.write(() => {
      this.fence(claim, now);
      this.db
        .prepare("UPDATE attempt_safety SET metadata=? WHERE attempt_id=?")
        .run(
          JSON.stringify({
            policyVersion: input.policyVersion,
            sourceHash: input.sourceHash,
            snapshotVersion: input.snapshotVersion,
          }),
          claim.attemptId,
        );
    });
  }
}
