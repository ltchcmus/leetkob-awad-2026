import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SandboxRequest } from "../../src/sandbox/contract.ts";
import { assertResult } from "./assertions.ts";
import type { CaseId } from "./assertions.ts";
import { executeCase, policyFor } from "./harness.ts";

const cases: readonly [CaseId, string, string][] = [
  ["AC", "valid.cpp", "5\n"],
  ["WA", "valid.cpp", "6\n"],
  ["CE", "compile-error.cpp", ""],
  ["M1", "m1-network.cpp", "NETWORK_BLOCKED_NO_ROUTE\n"],
  ["M2", "m2-cpu.cpp", ""],
  ["M3", "m3-wall.cpp", ""],
  ["M4", "m4-memory.cpp", ""],
  ["M5", "m5-pids.cpp", "PIDS_LIMIT_ENFORCED\n"],
  ["M6", "m6-output.cpp", ""],
  ["M7", "m7-user.cpp", "NONROOT_NO_ESCALATION\n"],
  ["M8", "m8-host.cpp", "NO_HOST_PATH_OR_SOCKET\n"],
  ["M9-runtime", "m9-runtime.cpp", "RUNTIME_SECRETS_ABSENT\n"],
  ["M9-compile", "m9-compile.cpp", "COMPILE_SECRET_PATHS_ABSENT\n"],
];

for (const [caseId, fixture, expectedOutput] of cases) {
  test(`sandbox ${caseId}: ${fixture}`, { timeout: 60_000 }, async () => {
    const source = readFileSync(
      new URL(`./fixtures/${fixture}`, import.meta.url),
      "utf8",
    );
    const runId = randomUUID();
    const request: SandboxRequest = {
      submissionId: `sandbox-test-${caseId}`,
      source: {
        text: source,
        sha256: createHash("sha256").update(source).digest("hex"),
      },
      tests: [{ id: "test-1", input: "2 3\n", expectedOutput }],
    };
    const { value, policy } = await executeCase(
      request,
      () => {
        const base = policyFor(process.env.SANDBOX_JUDGE_IMAGE ?? "");
        return caseId === "M3"
          ? { ...base, run: { ...base.run, wallTimeMs: 500 } }
          : base;
      },
      runId,
    );
    assertResult(value, request, policy, runId, caseId);
  });
}
