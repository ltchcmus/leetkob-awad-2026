import assert from "node:assert/strict";
import type {
  SandboxPolicy,
  SandboxRequest,
  SandboxResult,
} from "../../src/sandbox/contract.ts";

export type CaseId =
  | "AC"
  | "WA"
  | "CE"
  | "M1"
  | "M2"
  | "M3"
  | "M4"
  | "M5"
  | "M6"
  | "M7"
  | "M8"
  | "M9-runtime"
  | "M9-compile";

export function assertResult(
  value: SandboxResult,
  request: SandboxRequest,
  policy: SandboxPolicy,
  runId: string,
  caseId: CaseId,
) {
  assert.equal(
    value.kind,
    "completed",
    "infrastructure errors are RED, never a student verdict",
  );
  if (value.kind !== "completed") throw new Error("Expected completed result");
  assert.equal(value.submissionId, request.submissionId);
  assert.equal(value.sourceSha256, request.source.sha256);
  assert.equal(value.policyVersion, policy.version);
  assert.equal(value.cleanup.attempted, true);
  assert.equal(value.cleanup.succeeded, true);
  assert.deepEqual(value.cleanup.remainingContainerIds, []);
  assert.ok(value.isolation.some((x) => x.phase === "compile"));
  if (caseId !== "CE")
    assert.ok(value.isolation.some((x) => x.phase === "run"));
  for (const inspected of value.isolation) {
    const limits = policy[inspected.phase];
    assert.match(inspected.containerId, /^[a-f0-9]{12,64}$/);
    assert.equal(inspected.runId, runId);
    assert.equal(inspected.imageDigest, policy.image);
    assert.equal(inspected.networkMode, "none");
    assert.equal(inspected.user, "65534:65534");
    assert.equal(inspected.privileged, false);
    assert.equal(inspected.readonlyRootfs, true);
    assert.deepEqual(inspected.capDrop, ["ALL"]);
    assert.equal(inspected.noNewPrivileges, true);
    assert.ok(
      inspected.mounts.every(
        (m) => m.type === "tmpfs" && m.destination === "/work",
      ),
    );
    assert.equal(inspected.memoryBytes, limits.memoryBytes);
    assert.equal(inspected.memorySwapBytes, limits.memoryBytes);
    assert.equal(inspected.pids, limits.pids);
    assert.equal(inspected.cpuQuota, policy.cpuQuota);
    assert.ok(
      inspected.environmentNames.every((name) =>
        ["PATH", "HOME", "LANG", "LC_ALL", "HOSTNAME", "TMPDIR"].includes(name),
      ),
    );
  }
  for (const [phase, result] of [
    ["compile", value.compile],
    ...value.tests.map((t) => ["run", t.result] as const),
  ] as const) {
    assert.equal(
      result.capturedBytes,
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
    );
    assert.ok(result.capturedBytes <= policy[phase].outputBytes);
    assert.ok(
      !(result.stdout + result.stderr).includes(
        "LEETKOB_PUBLIC_TEST_CANARY_NOT_A_SECRET",
      ),
      "controller canary leaked through runtime or compiler output",
    );
    assert.ok(Number.isFinite(result.cpuTimeMs) && result.cpuTimeMs >= 0);
    assert.ok(Number.isFinite(result.wallTimeMs) && result.wallTimeMs >= 0);
    assert.ok(
      Number.isFinite(result.memoryPeakBytes) && result.memoryPeakBytes > 0,
    );
  }
  if (caseId === "CE") {
    assert.ok(value.isolation.every((x) => x.phase === "compile"));
    assert.equal(value.judgeStatus, "CE");
    assert.equal(value.compile.status, "CE");
    assert.equal(value.compile.reason, "compile_error");
    assert.deepEqual(value.tests, []);
    assert.ok(value.compile.stderr.length > 0);
    return;
  }
  assert.equal(value.compile.status, "AC");
  assert.equal(value.compile.reason, "ok");
  assert.equal(value.tests.length, 1);
  assert.equal(value.tests[0]?.testId, request.tests[0]?.id);
  const result = value.tests[0]!.result;
  const expected =
    caseId === "M2" || caseId === "M3"
      ? "TLE"
      : caseId === "M4"
        ? "MLE"
        : caseId === "M6"
          ? "RE"
          : caseId === "WA"
            ? "WA"
            : "AC";
  assert.equal(value.judgeStatus, expected);
  assert.equal(result.status, expected);
  if (caseId === "M2") {
    assert.equal(result.reason, "cpu_time");
    assert.ok(
      result.cpuTimeMs >= policy.run.cpuTimeMs,
      "must consume the CPU budget, not just hit a wall timer",
    );
    assert.ok(result.wallTimeMs < policy.run.wallTimeMs);
  } else if (caseId === "M3") {
    assert.equal(result.reason, "wall_clock");
    assert.match(result.stdout, /CHILD_STARTED=\d+/);
    assert.ok(result.wallTimeMs >= policy.run.wallTimeMs);
    assert.ok(result.wallTimeMs < policy.run.wallTimeMs + 2000);
  } else if (caseId === "M4") {
    assert.equal(result.reason, "memory");
    assert.equal(result.oomKilled, true);
  } else if (caseId === "M6") {
    assert.equal(result.reason, "output_limit");
    assert.equal(result.outputTruncated, true);
    assert.equal(result.capturedBytes, policy.run.outputBytes);
  } else if (caseId === "WA") {
    assert.equal(result.reason, "wrong_answer");
    assert.equal(result.stdout, "5\n");
  } else {
    assert.equal(result.reason, "ok");
    assert.equal(result.stdout, request.tests[0]!.expectedOutput);
    if (caseId === "M5") {
      const matches = /created=(\d+) blocked=1 reaped=(\d+)/.exec(
        result.stderr,
      );
      assert.ok(matches);
      const count = Number(matches[1]);
      assert.ok(count > 0 && count < policy.run.pids);
      assert.equal(count, Number(matches[2]));
    }
  }
}
