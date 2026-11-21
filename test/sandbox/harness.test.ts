import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type {
  PhaseResult,
  SandboxRequest,
  SandboxResult,
} from "../../src/sandbox/contract.ts";
import { assertResult } from "./assertions.ts";
import type { CaseId } from "./assertions.ts";
import {
  childEnvironment,
  fakeCanary,
  policyFor,
  runBoundedNode,
} from "./harness.ts";

test("harness: bounded trusted child returns a protocol response", async () => {
  assert.equal(
    await runBoundedNode(["-e", "process.stdout.write('ok')"], "", 3000, 32),
    "ok",
  );
});

test(
  "harness: independent watchdog kills a hung trusted child",
  { timeout: 5000 },
  async () => {
    await assert.rejects(
      runBoundedNode(["-e", "setInterval(() => {}, 1000)"], "", 300, 32),
      /outer_timeout/,
    );
  },
);

test(
  "harness: protocol capture is bounded even when trusted child floods output",
  { timeout: 5000 },
  async () => {
    await assert.rejects(
      runBoundedNode(
        ["-e", "process.stdout.write('x'.repeat(65536))"],
        "",
        3000,
        32,
      ),
      /protocol_output_limit/,
    );
  },
);

test("harness: provider environment is replaced with public test canaries", () => {
  const env = childEnvironment();
  assert.equal(env.MODEL_API_KEY, fakeCanary);
  assert.equal(env.OPENAI_API_KEY, fakeCanary);
  assert.equal(env.ANTHROPIC_API_KEY, fakeCanary);
  assert.equal(env.GEMINI_API_KEY, fakeCanary);
});

const runId = "00000000-0000-4000-8000-000000000000";
const policy = policyFor(`judge@sha256:${"0".repeat(64)}`);
const text = "synthetic oracle input; never compiled";
const request: SandboxRequest = {
  submissionId: "synthetic-oracle-only",
  source: { text, sha256: createHash("sha256").update(text).digest("hex") },
  tests: [{ id: "test-1", input: "", expectedOutput: "SAFE\n" }],
};

function phase(overrides: Partial<PhaseResult> = {}): PhaseResult {
  const result = {
    status: "AC" as const,
    reason: "ok" as const,
    stdout: "",
    stderr: "",
    capturedBytes: 0,
    outputTruncated: false,
    cpuTimeMs: 20,
    wallTimeMs: 40,
    memoryPeakBytes: 1024,
    oomKilled: false,
    ...overrides,
  };
  return {
    ...result,
    capturedBytes:
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
  };
}

function modeledResult(
  result: PhaseResult,
): Extract<SandboxResult, { kind: "completed" }> {
  return {
    kind: "completed",
    submissionId: request.submissionId,
    sourceSha256: request.source.sha256,
    policyVersion: policy.version,
    judgeStatus: result.status,
    compile: phase(),
    tests: [{ testId: "test-1", result }],
    isolation: (["compile", "run"] as const).map((name) => ({
      containerId: "a".repeat(64),
      runId,
      phase: name,
      imageDigest: policy.image,
      networkMode: "none",
      user: "65534:65534",
      privileged: false,
      readonlyRootfs: true,
      capDrop: ["ALL"],
      noNewPrivileges: true,
      mounts: [],
      memoryBytes: policy[name].memoryBytes,
      memorySwapBytes: policy[name].memoryBytes,
      pids: policy[name].pids,
      cpuQuota: 1,
      environmentNames: ["PATH"],
    })),
    cleanup: { attempted: true, succeeded: true, remainingContainerIds: [] },
  };
}

const modeled: readonly [CaseId, PhaseResult, PhaseResult][] = [
  [
    "M1",
    phase({ stdout: "SAFE\n" }),
    phase({ stdout: "NETWORK_ISOLATION_NOT_PROVEN\n" }),
  ],
  [
    "M2",
    phase({
      status: "TLE",
      reason: "cpu_time",
      cpuTimeMs: 1000,
      wallTimeMs: 1200,
    }),
    phase({ status: "TLE", reason: "wall_clock", cpuTimeMs: 20 }),
  ],
  [
    "M3",
    phase({
      status: "TLE",
      reason: "wall_clock",
      wallTimeMs: 5100,
      stdout: "CHILD_STARTED=2\n",
    }),
    phase({ status: "TLE", reason: "wall_clock", wallTimeMs: 5100 }),
  ],
  [
    "M4",
    phase({ status: "MLE", reason: "memory", oomKilled: true }),
    phase({ status: "AC", stdout: "MEMORY_LIMIT_NOT_ENFORCED\n" }),
  ],
  [
    "M5",
    phase({ stdout: "SAFE\n", stderr: "created=14 blocked=1 reaped=14\n" }),
    phase({ stdout: "SAFE\n", stderr: "created=80 blocked=0 reaped=80\n" }),
  ],
  [
    "M6",
    phase({
      status: "RE",
      reason: "output_limit",
      outputTruncated: true,
      stdout: "X".repeat(4096),
    }),
    phase({ status: "RE", reason: "output_limit", outputTruncated: false }),
  ],
  [
    "M7",
    phase({ stdout: "SAFE\n" }),
    phase({ stdout: "ROOT_OR_ESCALATION\n" }),
  ],
  ["M8", phase({ stdout: "SAFE\n" }), phase({ stdout: "HOST_ACCESSIBLE\n" })],
  [
    "M9-runtime",
    phase({ stdout: "SAFE\n" }),
    phase({ stdout: "SECRET_PRESENT\n" }),
  ],
  [
    "M9-compile",
    phase({ stdout: "SAFE\n" }),
    phase({ status: "CE", reason: "compile_error" }),
  ],
];

for (const [caseId, safe, weak] of modeled) {
  test(`oracle ${caseId}: accepts modeled safe evidence and rejects a weak outcome (no C++ execution)`, () => {
    assertResult(modeledResult(safe), request, policy, runId, caseId);
    assert.throws(() =>
      assertResult(modeledResult(weak), request, policy, runId, caseId),
    );
  });
}

test("oracle: a claimed timeout with surviving container is rejected", () => {
  const value = modeledResult(
    phase({
      status: "TLE",
      reason: "wall_clock",
      wallTimeMs: 5100,
      stdout: "CHILD_STARTED=2\n",
    }),
  );
  assert.throws(() =>
    assertResult(
      {
        ...value,
        cleanup: {
          attempted: true,
          succeeded: false,
          remainingContainerIds: ["a".repeat(64)],
        },
      },
      request,
      policy,
      runId,
      "M3",
    ),
  );
});

test("oracle: infrastructure failure cannot masquerade as a successful attack test", () => {
  assert.throws(() =>
    assertResult(
      {
        kind: "infrastructure_error",
        code: "daemon_unavailable",
        retryable: true,
        cleanup: {
          attempted: true,
          succeeded: true,
          remainingContainerIds: [],
        },
      },
      request,
      policy,
      runId,
      "M1",
    ),
  );
});
