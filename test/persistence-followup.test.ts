import assert from "node:assert/strict";
import { test } from "node:test";
import { workflowFixture } from "./helpers/workflow.ts";
import { WorkflowRepository } from "../src/db/workflow-repository.ts";
import { DurableLedger } from "../src/db/durable-ledger.ts";

test("sandbox crash is durably quarantined until UUID cleanup reconciliation", t => {
  const { repo, path, now, enqueue } = workflowFixture(t);
  enqueue();
  const claim = repo.claimJob("first", { now, leaseMs: 100 })!;
  repo.startSandboxAttempt(claim, now);
  const reopened = new WorkflowRepository(path);
  try {
    assert.equal(reopened.claimJob("next", { now: now + 101, leaseMs: 100 }), null);
    assert.equal(reopened.listQuarantinedAttempts()[0]?.attemptId, claim.attemptId);
    reopened.reconcileAttemptCleanup(claim.attemptId, { confirmed: false, operator: "operator", now: now + 102 });
    assert.equal(reopened.claimJob("next", { now: now + 103, leaseMs: 100 }), null);
    reopened.reconcileAttemptCleanup(claim.attemptId, { confirmed: true, operator: "operator", now: now + 104 });
    const next = reopened.claimJob("next", { now: now + 105, leaseMs: 100 })!;
    assert.equal(next.previousCleanupConfirmed, true);
    assert.notEqual(next.attemptId, claim.attemptId);
    assert.throws(() => repo.recordJudgeResult(claim, { judgeStatus: "WA", tests: ["WA"] }, now + 105), /lease-lost/);
  } finally { reopened.close(); }
});

test("submission snapshot retains ordered tests, constraints and limits after lab edits", t => {
  const { repo, now, enqueue, labId } = workflowFixture(t);
  enqueue();
  repo.db.prepare("UPDATE lab_details SET statement = 'edited', memory_mb = 512 WHERE lab_id = ?").run(labId);
  repo.db.prepare("UPDATE lab_tests SET expected_output = 'edited' WHERE lab_id = ?").run(labId);
  repo.db.prepare("UPDATE lab_constraints SET deduction_tenths = 99 WHERE lab_id = ?").run(labId);
  const claim = repo.claimJob("worker", { now, leaseMs: 1000 })!;
  assert.equal(claim.statement, "Return normally.");
  assert.equal(claim.tests[0]?.expectedOutput, "");
  assert.equal(claim.limits.memoryMb, 256);
  assert.equal(claim.constraints[0]?.deductionTenths, 30);
  assert.equal(claim.snapshotVersion, 1);
  assert.throws(() => repo.db.exec("UPDATE submission_snapshots SET payload = '{}'"), /immutable/);
});

test("quota reservations survive connections, enforce provider concurrency and settle once", t => {
  const { repo, path, now, labId, enqueue } = workflowFixture(t);
  enqueue();
  const claim = repo.claimJob("worker", { now, leaseMs: 1000 })!;
  const ledger = new DurableLedger(repo.db);
  ledger.configure({ labId, provider: "fake", maxCalls: 2, maxTokens: 1000, maxCostMicrousd: 0, requestsPerMinute: 2, tokensPerMinute: 1000, concurrency: 1, verifiedFree: true });
  const input = { labId, provider: "fake", attemptId: claim.attemptId, reservedTokens: 100, now };
  const first = ledger.reserveAttempt(input);
  assert.equal(first.allowed, true);
  if (!first.allowed) return;
  const reopened = new WorkflowRepository(path);
  try {
    const second = new DurableLedger(reopened.db);
    const replay = second.reserveAttempt(input);
    assert.equal(replay.allowed && replay.dispatchAllowed, false);
    assert.equal(second.reserveAttempt({ ...input, attemptId: "another-dispatch" }).allowed, false);
    ledger.settleAttempt({ reservationId: first.reservationId, usage: { tokens: 50, costMicrousd: 0 }, outcome: "success" });
    second.settleAttempt({ reservationId: first.reservationId, usage: { tokens: 1, costMicrousd: 0 }, outcome: "success" });
    assert.equal(repo.db.prepare("SELECT usage_tokens FROM quota_reservations").get()?.usage_tokens, 50);
  } finally { reopened.close(); }
});

test("unapproved model spending fails closed without a reservation", t => {
  const { repo, labId, now } = workflowFixture(t);
  const ledger = new DurableLedger(repo.db);
  assert.equal(ledger.reserveAttempt({ labId, provider: "paid", attemptId: "id", reservedTokens: 100, now }).allowed, false);
  ledger.configure({ labId, provider: "paid", maxCalls: 2, maxTokens: 1000, maxCostMicrousd: 0, requestsPerMinute: 2, tokensPerMinute: 1000, concurrency: 1, verifiedFree: false });
  assert.equal(ledger.reserveAttempt({ labId, provider: "paid", attemptId: "id", reservedTokens: 100, now }).allowed, false);
});
