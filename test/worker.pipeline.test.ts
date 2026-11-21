import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkflowRepository } from "../src/db/workflow-repository.ts";
import { processOneJob } from "../src/worker/worker.ts";
import type { PipelineAdapters } from "../src/worker/types.ts";
import { people, workflowFixture } from "./helpers/workflow.ts";

function adapters(): PipelineAdapters {
  return {
    runInSandbox: async () => ({
      kind: "judged",
      judgeStatus: "AC",
      tests: ["AC"],
    }),
    checkSubmission: async (input) => ({
      solution: input.solution,
      evaluations: input.constraints.map((c) => ({
        constraintId: c.id,
        verdict: "pass",
        source: "hard-rule",
        evidence: [],
      })),
    }),
  };
}

test("worker checks only AC and persists one complete set without identity in checker input", async (t) => {
  const { repo, now, enqueue, labId } = workflowFixture(t);
  const receipt = enqueue();
  const adapter = adapters();
  const check = adapter.checkSubmission;
  adapter.checkSubmission = async (input, signal) => {
    assert.deepEqual(Object.keys(input).sort(), [
      "constraints",
      "solution",
      "source",
      "statement",
    ]);
    return check(input, signal);
  };
  assert.equal(
    await processOneJob(repo, adapter, { workerId: "test", now: () => now }),
    "completed",
  );
  assert.equal(
    await processOneJob(repo, adapter, { workerId: "test", now: () => now }),
    "idle",
  );
  assert.equal(
    repo.getSubmissionForStudent(people.student, receipt.submissionId)
      .judgeVerdict,
    "AC",
  );
  assert.equal(repo.getReviewQueue(people.ta, labId).items.length, 2);
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
    1,
  );
});

test("worker never calls the checker for a non-AC submission", async (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  const receipt = enqueue();
  const adapter = adapters();
  adapter.runInSandbox = async () => ({
    kind: "judged",
    judgeStatus: "CE",
    tests: [],
  });
  adapter.checkSubmission = async () => {
    throw new Error("checker must not run");
  };
  assert.equal(
    await processOneJob(repo, adapter, { workerId: "test", now: () => now }),
    "completed",
  );
  assert.equal(
    repo.getSubmissionForStudent(people.student, receipt.submissionId)
      .judgeVerdict,
    "CE",
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
    0,
  );
});

test("sandbox engine errors and thrown failures retry without becoming WA or RE", async (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  const receipt = enqueue();
  const adapter = adapters();
  adapter.runInSandbox = async () => ({
    kind: "infrastructure_error",
    code: "sandbox_unavailable",
  });
  assert.equal(
    await processOneJob(repo, adapter, {
      workerId: "test",
      now: () => now,
      retryDelayMs: 0,
    }),
    "retry",
  );
  adapter.runInSandbox = async () => {
    throw new Error("secret-fixture must never be persisted");
  };
  assert.equal(
    await processOneJob(repo, adapter, {
      workerId: "test",
      now: () => now,
      retryDelayMs: 0,
    }),
    "retry",
  );
  assert.equal(
    repo.getSubmissionForStudent(people.student, receipt.submissionId)
      .judgeVerdict,
    null,
  );
  const errors = repo.db.prepare("SELECT error_code FROM attempts").all();
  assert.doesNotMatch(JSON.stringify(errors), /secret-fixture/);
});

test("checker outage retries the persisted AC checkpoint rather than running C++ again", async (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  enqueue();
  const adapter = adapters();
  let sandboxCalls = 0;
  const sandbox = adapter.runInSandbox;
  adapter.runInSandbox = async (job, signal) => {
    sandboxCalls++;
    return sandbox(job, signal);
  };
  const check = adapter.checkSubmission;
  adapter.checkSubmission = async () => {
    throw new Error("checker unavailable");
  };
  assert.equal(
    await processOneJob(repo, adapter, {
      workerId: "test",
      now: () => now,
      retryDelayMs: 0,
    }),
    "retry",
  );
  adapter.checkSubmission = check;
  assert.equal(
    await processOneJob(repo, adapter, { workerId: "test", now: () => now }),
    "completed",
  );
  assert.equal(sandboxCalls, 1);
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM attempts").get()?.n,
    2,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
    1,
  );
});

test("an invalid checker protocol becomes unsure with a reason, never a deduction", async (t) => {
  const { repo, now, enqueue, labId } = workflowFixture(t);
  enqueue();
  const adapter = adapters();
  adapter.checkSubmission = async (input) => ({
    solution: input.solution,
    evaluations: [],
  });
  assert.equal(
    await processOneJob(repo, adapter, { workerId: "test", now: () => now }),
    "completed",
  );
  const queue = repo.getReviewQueue(people.ta, labId).items;
  assert.equal(queue.length, 2);
  assert.ok(
    queue.every(
      (item) =>
        item.verdict === "unsure" &&
        item.reason === "invalid_checker_result" &&
        item.decision === null,
    ),
  );
  assert.equal(
    repo.db.prepare("SELECT score_tenths FROM counted_submissions").get()
      ?.score_tenths,
    0,
  );
});

test("worker watchdog aborts a stalled sandbox adapter and retries infrastructure", async (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  enqueue();
  const adapter = adapters();
  let signalSeen: AbortSignal | undefined;
  adapter.runInSandbox = async (_job, signal) => {
    signalSeen = signal;
    return new Promise(() => {});
  };
  assert.equal(
    await processOneJob(repo, adapter, {
      workerId: "test",
      now: () => now,
      adapterTimeoutMs: 30,
      retryDelayMs: 0,
    }),
    "retry",
  );
  assert.equal(signalSeen?.aborted, true);
  assert.equal(
    repo.db.prepare("SELECT last_error_code FROM jobs").get()?.last_error_code,
    "sandbox_timeout",
  );
});

test("worker discards a result after another worker has recovered its lease", async (t) => {
  const { repo, path, now, enqueue } = workflowFixture(t);
  const receipt = enqueue();
  let clock = now;
  const adapter = adapters();
  adapter.runInSandbox = async () => {
    clock += 1000;
    const replacement = new WorkflowRepository(path);
    try {
      assert.ok(
        replacement.claimJob("replacement", { now: clock, leaseMs: 1000 }),
      );
    } finally {
      replacement.close();
    }
    return { kind: "judged", judgeStatus: "WA", tests: ["WA"] };
  };
  assert.equal(
    await processOneJob(repo, adapter, {
      workerId: "test",
      now: () => clock,
      leaseMs: 1000,
    }),
    "lease_lost",
  );
  assert.equal(
    repo.getSubmissionForStudent(people.student, receipt.submissionId)
      .judgeVerdict,
    null,
  );
});
