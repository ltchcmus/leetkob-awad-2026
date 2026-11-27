import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createExecutionAdapters } from "../src/worker/execution.ts";
import type { SandboxPolicy } from "../src/sandbox/contract.ts";
import { workflowFixture } from "./helpers/workflow.ts";
const policy: SandboxPolicy = {
  ...JSON.parse(readFileSync("judge/policy.json", "utf8")),
  image: "judge@sha256:" + "a".repeat(64),
};
test("trusted policy applies validated lab limits without silently lowering defaults", async (t) => {
  const { repo, enqueue, now } = workflowFixture(t);
  enqueue();
  const claim = repo.claimJob("policy-test", { now, leaseMs: 30000 })!;
  let calls = 0;
  const adapter = createExecutionAdapters(policy, async (_request, applied) => {
    calls++;
    assert.equal(applied.run.memoryBytes, 256 * 1048576);
    assert.equal(applied.run.outputBytes, 1048576);
    assert.equal(applied.run.wallTimeMs, 3000);
    throw new Error("captured");
  });
  await assert.rejects(
    adapter.runInSandbox(claim, new AbortController().signal),
    /captured/,
  );
  assert.equal(calls, 1);
  for (const bad of [0, 513, Infinity, NaN, 64.5]) {
    const result = await adapter.runInSandbox(
      { ...claim, limits: { ...claim.limits, memoryMb: bad } },
      new AbortController().signal,
    );
    assert.equal(result.kind, "infrastructure_error");
  }
  assert.equal(calls, 1);
});
