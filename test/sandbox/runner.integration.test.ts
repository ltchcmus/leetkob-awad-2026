import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { connectDocker } from "../../src/sandbox/docker.ts";
import type {
  SandboxPolicy,
  SandboxRequest,
  SandboxResult,
} from "../../src/sandbox/contract.ts";
import { policyFor, runBoundedNode } from "./harness.ts";
import { assertResult } from "./assertions.ts";

function snapshot(text: string, expected = "", count = 1): SandboxRequest {
  return {
    submissionId: "integration",
    source: { text, sha256: createHash("sha256").update(text).digest("hex") },
    tests: Array.from({ length: count }, (_, i) => ({
      id: String(i),
      input: "",
      expectedOutput: expected,
    })),
  };
}
async function call(
  request: SandboxRequest,
  change: (p: SandboxPolicy) => SandboxPolicy = (p) => p,
  mode = "normal",
) {
  assert.equal(process.env.SANDBOX_RUN_ATTACKS, "1");
  const policy = change(policyFor(process.env.SANDBOX_JUDGE_IMAGE ?? ""));
  const runId = randomUUID();
  const engine = await connectDocker();
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`leetkob.sandbox.run=${runId}`] }),
  );
  const remaining = () =>
    engine.call<{ Id: string }[]>(
      "GET",
      `/containers/json?all=true&filters=${filters}`,
    );
  try {
    const response = runBoundedNode(
      [fileURLToPath(new URL("./extra-child.ts", import.meta.url))],
      JSON.stringify({ request, policy, runId, mode }),
      30_000,
      128 * 1024,
    );
    if (mode === "crash") {
      await assert.rejects(response, /runner_process_exit_77/);
      const until = Date.now() + 15_000;
      while ((await remaining()).length && Date.now() < until) await sleep(100);
      assert.deepEqual(
        await remaining(),
        [],
        "detached watchdog must remove orphan after worker crash",
      );
      return undefined;
    }
    const value = JSON.parse(await response) as SandboxResult;
    assert.equal(value.cleanup.succeeded, true);
    assert.deepEqual(await remaining(), []);
    return value;
  } finally {
    for (const c of await remaining())
      await engine.call("DELETE", `/containers/${c.Id}?force=true&v=true`);
  }
}

test(
  "integration: token comparison and first failing test produce an ordered prefix",
  { timeout: 60_000 },
  async () => {
    const request = snapshot(
      '#include <cstdio>\nint main(){std::puts("5");}',
      "  5 \n",
      3,
    );
    const value = await call({
      ...request,
      tests: [
        request.tests[0]!,
        { ...request.tests[1]!, expectedOutput: "6" },
        request.tests[2]!,
      ],
    });
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "WA");
      assert.deepEqual(
        value.tests.map((t) => [t.testId, t.result.status]),
        [
          ["0", "AC"],
          ["1", "WA"],
        ],
      );
    }
  },
);
test(
  "integration: each test receives pristine writable state",
  { timeout: 60_000 },
  async () => {
    const value = await call(
      snapshot(
        '#include <cstdio>\n#include <unistd.h>\nint main(){if(access("/work/marker",F_OK)==0)return 1;FILE*f=fopen("/work/marker","w");if(!f)return 2;fclose(f);puts("fresh");}',
        "fresh\n",
        2,
      ),
    );
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "AC");
      assert.equal(value.tests.length, 2);
      assert.equal(
        new Set(
          value.isolation
            .filter((i) => i.phase === "run")
            .map((i) => i.containerId),
        ).size,
        2,
      );
    }
  },
);
test(
  "integration: runtime nonzero exit is RE rather than infrastructure failure",
  { timeout: 60_000 },
  async () => {
    const value = await call(snapshot("int main(){return 3;}"));
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "RE");
      assert.equal(value.tests[0]?.result.reason, "exit_code");
    }
  },
);
test(
  "integration: cancellation removes active containers and is not a student verdict",
  { timeout: 60_000 },
  async () => {
    const value = await call(
      snapshot("#include <unistd.h>\nint main(){sleep(20);}"),
      (p) => p,
      "cancel",
    );
    assert.equal(value?.kind, "infrastructure_error");
    if (value?.kind === "infrastructure_error") {
      assert.equal(value.code, "cancelled");
      assert.equal(value.retryable, false);
    }
  },
);
test(
  "integration: compiler wall deadline kills its whole container",
  { timeout: 60_000 },
  async () => {
    const value = await call(
      snapshot("#include <iostream>\nint main(){std::cout<<5;}"),
      (p) => ({ ...p, compile: { ...p.compile, wallTimeMs: 100 } }),
    );
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "TLE");
      assert.equal(value.compile.reason, "wall_clock");
      assert.deepEqual(value.tests, []);
    }
  },
);
test(
  "integration: compiler diagnostics obey their byte cap",
  { timeout: 60_000 },
  async () => {
    const value = await call(snapshot("int main(){not_declared();}"), (p) => ({
      ...p,
      compile: { ...p.compile, outputBytes: 64 },
    }));
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "CE");
      assert.equal(value.compile.reason, "output_limit");
      assert.equal(value.compile.outputTruncated, true);
      assert.equal(value.compile.capturedBytes, 64);
      assert.deepEqual(value.tests, []);
    }
  },
);
test(
  "integration: detached watchdog removes a container after trusted worker crash",
  { timeout: 60_000 },
  async () => {
    await call(
      snapshot("#include <unistd.h>\nint main(){sleep(20);}"),
      (p) => ({ ...p, run: { ...p.run, wallTimeMs: 500 } }),
      "crash",
    );
  },
);

test(
  "integration: compiler CPU budget includes its process tree",
  { timeout: 60_000 },
  async () => {
    const value = await call(
      snapshot("#include <iostream>\nint main(){std::cout<<5;}"),
      (p) => ({
        ...p,
        cpuQuota: 0.1,
        compile: { ...p.compile, cpuTimeMs: 100 },
      }),
    );
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "TLE");
      assert.equal(value.compile.reason, "cpu_time");
      assert.ok(value.compile.cpuTimeMs >= 100);
      assert.deepEqual(value.tests, []);
    }
  },
);
test(
  "integration: compiler memory exhaustion is MLE with OOM evidence",
  { timeout: 60_000 },
  async () => {
    const value = await call(
      snapshot("#include <iostream>\nint main(){std::cout<<5;}"),
      (p) => ({
        ...p,
        compile: { ...p.compile, memoryBytes: 16 * 1024 * 1024 },
      }),
    );
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "MLE");
      assert.equal(value.compile.reason, "memory");
      assert.equal(value.compile.oomKilled, true);
      assert.deepEqual(value.tests, []);
    }
  },
);

test(
  "negative control: wall-only termination fails the original CPU-budget oracle",
  { timeout: 60_000 },
  async () => {
    const request = snapshot(
      readFileSync(new URL("./fixtures/m2-cpu.cpp", import.meta.url), "utf8"),
    );
    const value = await call(request, (p) => ({
      ...p,
      run: { ...p.run, cpuTimeMs: 10_000, wallTimeMs: 500 },
    }));
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "TLE");
      assert.equal(value.tests[0]?.result.reason, "wall_clock");
      assert.throws(() =>
        assertResult(
          value,
          request,
          policyFor(process.env.SANDBOX_JUDGE_IMAGE!),
          value.isolation[0]!.runId,
          "M2",
        ),
      );
    }
  },
);
test(
  "negative control: bounded larger memory permits readback and fails the M4 oracle",
  { timeout: 60_000 },
  async () => {
    const request = snapshot(
      readFileSync(
        new URL("./fixtures/m4-memory.cpp", import.meta.url),
        "utf8",
      ),
      "MEMORY_LIMIT_NOT_ENFORCED=3588096\n",
    );
    const value = await call(request, (p) => ({
      ...p,
      run: { ...p.run, memoryBytes: 256 * 1024 * 1024 },
    }));
    assert.equal(
      value?.kind,
      "completed",
      value?.kind === "infrastructure_error" ? value.code : undefined,
    );
    if (value?.kind === "completed") {
      assert.equal(value.judgeStatus, "AC");
      assert.equal(
        value.tests[0]?.result.stdout,
        request.tests[0]!.expectedOutput,
      );
      assert.throws(() =>
        assertResult(
          value,
          request,
          policyFor(process.env.SANDBOX_JUDGE_IMAGE!),
          value.isolation[0]!.runId,
          "M4",
        ),
      );
    }
  },
);
