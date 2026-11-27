import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type QuotaPolicy = {
  labId: number;
  provider: string;
  maxCalls: number;
  maxTokens: number;
  maxCostMicrousd: number;
  requestsPerMinute: number;
  requestsPerDay?: number;
  tokensPerMinute: number;
  concurrency: number;
  verifiedFree: boolean;
};
type Reservation =
  | { allowed: false; reason: string }
  | { allowed: true; reservationId: string; dispatchAllowed: boolean };

export class DurableLedger {
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  private readonly db: DatabaseSync;
  private transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  configure(policy: QuotaPolicy): void {
    const numbers = [
      policy.labId,
      policy.maxCalls,
      policy.maxTokens,
      policy.maxCostMicrousd,
      policy.requestsPerMinute,
      policy.requestsPerDay ?? policy.maxCalls,
      policy.tokensPerMinute,
      policy.concurrency,
    ];
    if (
      numbers.some((n) => !Number.isSafeInteger(n) || n < 0) ||
      !policy.provider ||
      policy.concurrency < 1
    )
      throw new Error("invalid_quota_policy");
    this.db
      .prepare(
        `INSERT INTO quota_policies VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(lab_id,provider) DO UPDATE SET max_calls=excluded.max_calls,max_tokens=excluded.max_tokens,max_cost=excluded.max_cost,rpd=excluded.rpd,rpm=excluded.rpm,tpm=excluded.tpm,concurrency=excluded.concurrency,verified_free=excluded.verified_free`,
      )
      .run(
        policy.labId,
        policy.provider,
        policy.maxCalls,
        policy.maxTokens,
        policy.maxCostMicrousd,
        policy.requestsPerDay ?? policy.maxCalls,
        policy.requestsPerMinute,
        policy.tokensPerMinute,
        policy.concurrency,
        Number(policy.verifiedFree),
      );
  }
  reserveAttempt(input: {
    labId: number;
    provider: string;
    attemptId: string;
    reservedTokens: number;
    reservedCostMicrousd?: number;
    now: number;
  }): Reservation {
    if (
      !input.attemptId ||
      !Number.isSafeInteger(input.now) ||
      !Number.isSafeInteger(input.reservedTokens) ||
      input.reservedTokens < 0
    )
      throw new Error("invalid_reservation");
    const cost = input.reservedCostMicrousd ?? 0;
    if (!Number.isSafeInteger(cost) || cost < 0)
      throw new Error("invalid_reservation");
    return this.transaction(() => {
      const old = this.db
        .prepare(
          "SELECT id,lab_id FROM quota_reservations WHERE provider=? AND attempt_id=?",
        )
        .get(input.provider, input.attemptId);
      if (old)
        return old.lab_id === input.labId
          ? {
              allowed: true,
              reservationId: String(old.id),
              dispatchAllowed: false,
            }
          : { allowed: false, reason: "reservation_conflict" };
      const p = this.db
        .prepare("SELECT * FROM quota_policies WHERE lab_id=? AND provider=?")
        .get(input.labId, input.provider);
      if (!p || (!p.verified_free && (cost === 0 || p.max_cost === 0)))
        return { allowed: false, reason: "unapproved_budget" };
      const lab = this.db
        .prepare(
          `SELECT COUNT(*) calls,COALESCE(SUM(COALESCE(usage_tokens,reserved_tokens)),0) tokens,COALESCE(SUM(COALESCE(usage_cost,reserved_cost)),0) cost FROM quota_reservations WHERE lab_id=?`,
        )
        .get(input.labId)!;
      const window = this.db
        .prepare(
          `SELECT COUNT(*) calls,COALESCE(SUM(COALESCE(usage_tokens,reserved_tokens)),0) tokens FROM quota_reservations WHERE provider=? AND created_at>?`,
        )
        .get(input.provider, input.now - 60000)!;
      const active = this.db
        .prepare(
          "SELECT COUNT(*) n FROM quota_reservations WHERE provider=? AND state<>'settled'",
        )
        .get(input.provider)!;
      const day = this.db
        .prepare(
          "SELECT COUNT(*) n FROM quota_reservations WHERE provider=? AND created_at>?",
        )
        .get(input.provider, input.now - 86400000)!;
      const labCap = this.db
        .prepare(
          "SELECT MIN(max_calls) calls,MIN(max_tokens) tokens,MIN(max_cost) cost FROM quota_policies WHERE lab_id=?",
        )
        .get(input.labId)!;
      const providerCap = this.db
        .prepare(
          "SELECT MIN(rpd) rpd,MIN(rpm) rpm,MIN(tpm) tpm,MIN(concurrency) concurrency FROM quota_policies WHERE provider=?",
        )
        .get(input.provider)!;
      if (
        Number(lab.calls) >= Number(labCap.calls) ||
        Number(lab.tokens) + input.reservedTokens > Number(labCap.tokens) ||
        Number(lab.cost) + cost > Number(labCap.cost)
      )
        return { allowed: false, reason: "lab_budget" };
      if (
        Number(day.n) >= Number(providerCap.rpd) ||
        Number(window.calls) >= Number(providerCap.rpm) ||
        Number(window.tokens) + input.reservedTokens >
          Number(providerCap.tpm) ||
        Number(active.n) >= Number(providerCap.concurrency)
      )
        return { allowed: false, reason: "provider_quota" };
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO quota_reservations(id,lab_id,provider,attempt_id,reserved_tokens,reserved_cost,created_at,state) VALUES (?,?,?,?,?,?,?,'reserved')",
        )
        .run(
          id,
          input.labId,
          input.provider,
          input.attemptId,
          input.reservedTokens,
          cost,
          input.now,
        );
      return { allowed: true, reservationId: id, dispatchAllowed: true };
    });
  }
  settleAttempt(input: {
    reservationId: string;
    usage?: { tokens: number; costMicrousd: number };
    outcome: "success" | "failure" | "uncertain";
  }): void {
    if (
      input.usage &&
      [input.usage.tokens, input.usage.costMicrousd].some(
        (n) => !Number.isSafeInteger(n) || n < 0,
      )
    )
      throw new Error("invalid_usage");
    this.transaction(() => {
      const old = this.db
        .prepare("SELECT state FROM quota_reservations WHERE id=?")
        .get(input.reservationId);
      if (!old) throw new Error("unknown_reservation");
      if (old.state === "settled") return;
      if (!input.usage || input.outcome === "uncertain") {
        this.db
          .prepare(
            "UPDATE quota_reservations SET state='uncertain',outcome=? WHERE id=?",
          )
          .run(input.outcome, input.reservationId);
        return;
      }
      this.db
        .prepare(
          "UPDATE quota_reservations SET state='settled',usage_tokens=?,usage_cost=?,outcome=? WHERE id=?",
        )
        .run(
          input.usage.tokens,
          input.usage.costMicrousd,
          input.outcome,
          input.reservationId,
        );
    });
  }
}
