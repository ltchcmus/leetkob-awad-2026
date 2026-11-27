import assert from "node:assert/strict";
import { test } from "node:test";
import { createExecutionAdapters } from "../src/worker/execution.ts";
import { FakeProvider } from "../src/ai/providers/fake.ts";
import { ModelRouter } from "../src/ai/router.ts";
import { processOneJob } from "../src/worker/worker.ts";
import type { SandboxPolicy } from "../src/sandbox/contract.ts";
import { people, workflowFixture } from "./helpers/workflow.ts";

const phase = {
  cpuTimeMs: 1000,
  wallTimeMs: 3000,
  memoryBytes: 64 * 1024 * 1024,
  pids: 16,
  outputBytes: 4096,
};
const policy: SandboxPolicy = {
  version: "test-policy",
  image: "judge@sha256:" + "a".repeat(64),
  compilerProfile: "cpp17-o2",
  cpuQuota: 1,
  compile: phase,
  run: phase,
  workBytes: 1024 * 1024,
};

test("AC persists routed verdicts through SQLite and dispatches only the semantic constraint", async (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  enqueue();
  const model = new FakeProvider(
    "fake",
    {
      requestsPerMinute: 10,
      tokensPerMinute: 10000,
      concurrency: 1,
    },
    [
      {
        kind: "success",
        text: JSON.stringify([
          { constraintId: "C2", verdict: "pass", evidence: [] },
        ]),
      },
    ],
  );
  const router = new ModelRouter([model], {
    off: false,
    timeoutMs: 500,
    maxAttempts: 1,
    maxOutputTokens: 128,
    maxLabCalls: 1,
    maxLabTokens: 10000,
  });
  const phaseResult = {
    status: "AC",
    reason: "ok",
    stdout: "",
    stderr: "",
    capturedBytes: 0,
    outputTruncated: false,
    cpuTimeMs: 0,
    wallTimeMs: 0,
    memoryPeakBytes: 0,
    oomKilled: false,
  } as const;
  const adapter = createExecutionAdapters(
    policy,
    async (request, applied, context) => {
      assert.equal(request.tests[0]?.id, "case-1");
      assert.match(request.source.sha256, /^[a-f0-9]{64}$/u);
      assert.match(context.runId, /^[a-f0-9-]{36}$/u);
      assert.equal(applied.run.memoryBytes, policy.run.memoryBytes);
      return {
        kind: "completed",
        submissionId: request.submissionId,
        sourceSha256: request.source.sha256,
        policyVersion: applied.version,
        judgeStatus: "AC",
        compile: phaseResult,
        tests: [{ testId: "case-1", result: phaseResult }],
        isolation: [],
        cleanup: {
          attempted: true,
          succeeded: true,
          remainingContainerIds: [],
        },
      };
    },
    router,
  );
  assert.equal(
    await processOneJob(repo, adapter, { workerId: "test", now: () => now }),
    "completed",
  );
  assert.equal(model.calls.length, 1);
  assert.doesNotMatch(model.calls[0]!.request.prompt, /goto|deductionTenths/u);
  const rows = repo.db
    .prepare(
      "SELECT constraint_id, verdict, origin FROM verdicts ORDER BY constraint_id",
    )
    .all();
  assert.deepEqual(
    rows.map((row) => [row.constraint_id, row.verdict, row.origin]),
    [
      ["C1", "pass", "hard-rule"],
      ["C2", "pass", "model"],
    ],
  );
});

test("uncertain cleanup quarantines execution and reclaim opens no new sandbox", async (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  const receipt = enqueue();
  let calls = 0;
  const adapters = () =>
    createExecutionAdapters(policy, async () => {
      calls++;
      return {
        kind: "infrastructure_error",
        code: "cleanup_failed",
        retryable: true,
        cleanup: {
          attempted: true,
          succeeded: false,
          remainingContainerIds: ["synthetic"],
        },
      };
    });
  const first = await processOneJob(repo, adapters(), {
    workerId: "first",
    now: () => now,
    leaseMs: 100,
  });
  assert.equal(first, "quarantined");
  const next = await processOneJob(repo, adapters(), {
    workerId: "next",
    now: () => now + 101,
  });
  assert.equal(next, "quarantined");
  assert.equal(calls, 1);
  assert.equal(
    repo.getSubmissionForStudent(people.student, receipt.submissionId)
      .judgeVerdict,
    null,
  );
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
    0,
  );
});

test("clean retryable failure waits for sandbox cleanup after cancellation", async (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  enqueue();
  const stop = new AbortController();
  let settled = false;
  const adapter = createExecutionAdapters(
    policy,
    async (_request, _trusted, { signal }) => {
      stop.abort();
      assert.equal(signal.aborted, true);
      await new Promise((resolve) => setTimeout(resolve, 5));
      settled = true;
      return {
        kind: "infrastructure_error",
        code: "controller_timeout",
        retryable: true,
        cleanup: {
          attempted: true,
          succeeded: true,
          remainingContainerIds: [],
        },
      };
    },
  );
  assert.equal(
    await processOneJob(repo, adapter, {
      workerId: "cancel",
      now: () => now,
      signal: stop.signal,
    }),
    "retry",
  );
  assert.equal(settled, true);
});

test("clean but nonretryable sandbox cancellation still requires reconciliation", async (t) => {
  const { repo, now, enqueue } = workflowFixture(t);
  enqueue();
  const adapter = createExecutionAdapters(policy, async () => ({
    kind: "infrastructure_error",
    code: "cancelled",
    retryable: false,
    cleanup: { attempted: true, succeeded: true, remainingContainerIds: [] },
  }));
  assert.equal(
    await processOneJob(repo, adapter, { workerId: "cancel", now: () => now }),
    "quarantined",
  );
});
