import { createHash } from "node:crypto";
import type {
  PhaseLimits,
  SandboxContext,
  SandboxPolicy,
  SandboxRequest,
} from "./contract.ts";

export class SandboxFailure extends Error {
  constructor(code: string) {
    super(code);
  }
}
function keys(value: unknown, allowed: readonly string[]) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === allowed.length &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}
function text(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value) <= max &&
    Buffer.from(value).toString("utf8") === value
  );
}
function integer(value: number, min: number, max: number) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function limits(value: PhaseLimits) {
  return (
    keys(value, [
      "cpuTimeMs",
      "wallTimeMs",
      "memoryBytes",
      "pids",
      "outputBytes",
    ]) &&
    integer(value.cpuTimeMs, 100, 30_000) &&
    integer(value.wallTimeMs, 100, 60_000) &&
    integer(value.memoryBytes, 16 * 1024 * 1024, 1024 * 1024 * 1024) &&
    integer(value.pids, 4, 128) &&
    integer(value.outputBytes, 64, 1048576)
  );
}
export function validateInputs(
  request: SandboxRequest,
  policy: SandboxPolicy,
  context: SandboxContext,
) {
  if (
    !keys(request, ["submissionId", "source", "tests"]) ||
    !text(request.submissionId, 128) ||
    !keys(request.source, ["text", "sha256"]) ||
    !text(request.source.text, 1024 * 1024) ||
    request.source.sha256 !==
      createHash("sha256").update(request.source.text).digest("hex") ||
    !Array.isArray(request.tests) ||
    request.tests.length < 1 ||
    request.tests.length > 100 ||
    request.tests.some(
      (t) =>
        !keys(t, ["id", "input", "expectedOutput"]) ||
        !text(t.id, 128) ||
        !t.id ||
        !text(t.input, 4 * 1024 * 1024) ||
        !text(t.expectedOutput, 4 * 1024 * 1024),
    ) ||
    new Set(request.tests.map((t) => t.id)).size !== request.tests.length ||
    request.tests.reduce(
      (sum, t) =>
        sum + Buffer.byteLength(t.input) + Buffer.byteLength(t.expectedOutput),
      0,
    ) >
      4 * 1024 * 1024
  ) {
    throw new SandboxFailure("invalid_request");
  }
  if (
    !keys(policy, [
      "version",
      "image",
      "compilerProfile",
      "cpuQuota",
      "compile",
      "run",
      "workBytes",
    ]) ||
    !text(policy.version, 128) ||
    !policy.version ||
    !/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(policy.image) ||
    policy.compilerProfile !== "cpp17-o2" ||
    !Number.isFinite(policy.cpuQuota) ||
    policy.cpuQuota <= 0 ||
    policy.cpuQuota > 2 ||
    !limits(policy.compile) ||
    !limits(policy.run) ||
    !integer(policy.workBytes, 1024 * 1024, 64 * 1024 * 1024)
  ) {
    throw new SandboxFailure("invalid_policy");
  }
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      context.runId,
    ) ||
    !(context.signal instanceof AbortSignal)
  ) {
    throw new SandboxFailure("invalid_request");
  }
  return {
    request: Object.freeze({
      ...request,
      source: Object.freeze({ ...request.source }),
      tests: Object.freeze(request.tests.map((t) => Object.freeze({ ...t }))),
    }),
    policy: Object.freeze({
      ...policy,
      compile: Object.freeze({ ...policy.compile }),
      run: Object.freeze({ ...policy.run }),
    }),
  };
}
