import assert from "node:assert/strict";
import { test } from "node:test";
import { workflowFixture } from "./helpers/workflow.ts";
import { WorkflowRepository } from "../src/db/workflow-repository.ts";
import { DurableLedger } from "../src/db/durable-ledger.ts";
import { people } from "./helpers/workflow.ts";
import { withDurableQuota } from "../src/worker/ledger-provider.ts";

test("sandbox crash is durably quarantined until UUID cleanup reconciliation", (t) => {
  const { repo, path, now, enqueue } = workflowFixture(t);
  enqueue();
  const claim = repo.claimJob("first", { now, leaseMs: 100 })!;
  repo.startSandboxAttempt(claim, now);
  const reopened = new WorkflowRepository(path);
  try {
    assert.equal(
      reopened.claimJob("next", { now: now + 101, leaseMs: 100 }),
      null,
    );
    assert.equal(
      reopened.listQuarantinedAttempts()[0]?.attemptId,
      claim.attemptId,
    );
    reopened.reconcileAttemptCleanup(claim.attemptId, {
      confirmed: false,
      operator: "operator",
      now: now + 102,
    });
    assert.equal(
      reopened.claimJob("next", { now: now + 103, leaseMs: 100 }),
      null,
    );
    reopened.reconcileAttemptCleanup(claim.attemptId, {
      confirmed: true,
      operator: "operator",
      now: now + 104,
    });
    const next = reopened.claimJob("next", { now: now + 105, leaseMs: 100 })!;
    assert.equal(next.previousCleanupConfirmed, true);
    assert.notEqual(next.attemptId, claim.attemptId);
    assert.throws(
      () =>
        repo.recordJudgeResult(
          claim,
          { judgeStatus: "WA", tests: ["WA"] },
          now + 105,
        ),
      /lease-lost/,
    );
  } finally {
    reopened.close();
  }
});

test("submission snapshot retains ordered tests, constraints and limits after lab edits", (t) => {
  const { repo, now, enqueue, labId } = workflowFixture(t);
  enqueue();
  repo.db
    .prepare(
      "UPDATE lab_details SET statement = 'edited', memory_mb = 512 WHERE lab_id = ?",
    )
    .run(labId);
  repo.db
    .prepare("UPDATE lab_tests SET expected_output = 'edited' WHERE lab_id = ?")
    .run(labId);
  repo.db
    .prepare(
      "UPDATE lab_constraints SET deduction_tenths = 99 WHERE lab_id = ?",
    )
    .run(labId);
  const claim = repo.claimJob("worker", { now, leaseMs: 1000 })!;
  assert.equal(claim.statement, "Return normally.");
  assert.equal(claim.tests[0]?.expectedOutput, "");
  assert.equal(claim.limits.memoryMb, 256);
  assert.equal(claim.constraints[0]?.deductionTenths, 30);
  assert.equal(claim.snapshotVersion, 1);
  repo.submit(people.other, labId, { source: "int main() {}" }, now + 1);
  const next = repo.claimJob("second", { now: now + 1, leaseMs: 1000 })!;
  assert.equal(next.snapshotVersion, 2);
  assert.equal(next.statement, "edited");
  assert.throws(
    () => repo.db.exec("UPDATE submission_snapshots SET payload = '{}'"),
    /immutable/,
  );
});

test("quota reservations survive connections, enforce provider concurrency and settle once", (t) => {
  const { repo, path, now, labId, enqueue } = workflowFixture(t);
  enqueue();
  const claim = repo.claimJob("worker", { now, leaseMs: 1000 })!;
  const ledger = new DurableLedger(repo.db);
  ledger.configure({
    labId,
    provider: "fake",
    maxCalls: 2,
    maxTokens: 1000,
    maxCostMicrousd: 0,
    requestsPerMinute: 2,
    tokensPerMinute: 1000,
    concurrency: 1,
    verifiedFree: true,
  });
  const input = {
    labId,
    provider: "fake",
    attemptId: claim.attemptId,
    reservedTokens: 100,
    now,
  };
  const first = ledger.reserveAttempt(input);
  assert.equal(first.allowed, true);
  if (!first.allowed) return;
  const reopened = new WorkflowRepository(path);
  try {
    const second = new DurableLedger(reopened.db);
    const replay = second.reserveAttempt(input);
    assert.equal(replay.allowed && replay.dispatchAllowed, false);
    assert.equal(
      second.reserveAttempt({ ...input, attemptId: "another-dispatch" })
        .allowed,
      false,
    );
    ledger.settleAttempt({
      reservationId: first.reservationId,
      usage: { tokens: 50, costMicrousd: 0 },
      outcome: "success",
    });
    second.settleAttempt({
      reservationId: first.reservationId,
      usage: { tokens: 1, costMicrousd: 0 },
      outcome: "success",
    });
    assert.equal(
      repo.db.prepare("SELECT usage_tokens FROM quota_reservations").get()
        ?.usage_tokens,
      50,
    );
  } finally {
    reopened.close();
  }
});

test("unapproved model spending fails closed without a reservation", (t) => {
  const { repo, labId, now } = workflowFixture(t);
  const ledger = new DurableLedger(repo.db);
  assert.equal(
    ledger.reserveAttempt({
      labId,
      provider: "paid",
      attemptId: "id",
      reservedTokens: 100,
      now,
    }).allowed,
    false,
  );
  ledger.configure({
    labId,
    provider: "paid",
    maxCalls: 2,
    maxTokens: 1000,
    maxCostMicrousd: 0,
    requestsPerMinute: 2,
    tokensPerMinute: 1000,
    concurrency: 1,
    verifiedFree: false,
  });
  assert.equal(
    ledger.reserveAttempt({
      labId,
      provider: "paid",
      attemptId: "id",
      reservedTokens: 100,
      now,
    }).allowed,
    false,
  );
});

test("uncertain usage keeps its budget and concurrency reservation across restart", (t) => {
  const { repo, path, labId, now } = workflowFixture(t);
  const ledger = new DurableLedger(repo.db);
  ledger.configure({
    labId,
    provider: "fake",
    maxCalls: 3,
    maxTokens: 1000,
    maxCostMicrousd: 0,
    requestsPerMinute: 3,
    tokensPerMinute: 1000,
    concurrency: 1,
    verifiedFree: true,
  });
  const first = ledger.reserveAttempt({
    labId,
    provider: "fake",
    attemptId: "one",
    reservedTokens: 100,
    now,
  });
  assert.ok(first.allowed);
  if (!first.allowed) return;
  ledger.settleAttempt({
    reservationId: first.reservationId,
    outcome: "uncertain",
  });
  const reopened = new WorkflowRepository(path);
  try {
    assert.equal(
      new DurableLedger(reopened.db).reserveAttempt({
        labId,
        provider: "fake",
        attemptId: "two",
        reservedTokens: 100,
        now: now + 60001,
      }).allowed,
      false,
    );
  } finally {
    reopened.close();
  }
});

test("durable provider refuses duplicate dispatch and logs only confirmed usage", async (t) => {
  const { repo, path, labId, now, enqueue } = workflowFixture(t);
  enqueue();
  const claim = repo.claimJob("worker", { now, leaseMs: 1000 })!;
  new DurableLedger(repo.db).configure({
    labId,
    provider: "fake",
    maxCalls: 2,
    maxTokens: 10000,
    maxCostMicrousd: 0,
    requestsPerMinute: 2,
    tokensPerMinute: 10000,
    concurrency: 1,
    verifiedFree: true,
  });
  let calls = 0;
  const provider = withDurableQuota(
    {
      id: "fake",
      model: "test",
      quota: { requestsPerMinute: 2, tokensPerMinute: 10000, concurrency: 1 },
      async generate() {
        calls++;
        return {
          kind: "success",
          text: "[]",
          providerRequestId: "synthetic-request-id",
          usage: { inputTokens: 10, outputTokens: 5 },
        };
      },
    },
    { databasePath: path, labId, attemptId: claim.attemptId },
  );
  const signal = new AbortController().signal;
  assert.equal(
    (
      await provider.generate(
        { prompt: "synthetic", maxOutputTokens: 10 },
        signal,
      )
    ).kind,
    "success",
  );
  assert.equal(
    (
      await provider.generate(
        { prompt: "synthetic", maxOutputTokens: 10 },
        signal,
      )
    ).kind,
    "failure",
  );
  assert.equal(calls, 1);
  assert.equal(
    repo.db.prepare("SELECT attempt_id FROM model_call_metadata").get()
      ?.attempt_id,
    claim.attemptId,
  );
  assert.equal(
    repo.db.prepare("SELECT usage_tokens FROM quota_reservations").get()
      ?.usage_tokens,
    15,
  );
});

test("trusted redaction and attempt metadata exclude arbitrary submitted fields", (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  enqueue();
  const claim = repo.claimJob("worker", { now, leaseMs: 1000 })!;
  assert.throws(
    () =>
      repo.setTrustedIdentities(people.student, people.student.id, ["Name"]),
    /assigned TA/,
  );
  repo.setTrustedIdentities(people.admin, people.student.id, [
    "Synthetic Name",
    "id@student.invalid",
  ]);
  assert.deepEqual(repo.getRedactionContext(claim), [
    people.student.id,
    "Synthetic Name",
    "id@student.invalid",
  ]);
  repo.startSandboxAttempt(claim, now);
  repo.recordAttemptMetadata(
    claim,
    {
      sourceHash: "a".repeat(64),
      snapshotVersion: 1,
      policyVersion: "policy",
      ...{ stderr: "private-secret" },
    },
    now,
  );
  const stored = String(
    repo.db.prepare("SELECT metadata FROM attempt_safety").get()?.metadata,
  );
  assert.doesNotMatch(stored, /stderr|private-secret/);
});
