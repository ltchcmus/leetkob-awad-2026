import { createHash } from "node:crypto";
import { loadModelRouter } from "../ai/config.ts";
import type { ModelRouter } from "../ai/router.ts";
import { checkSubmission } from "../checker/orchestrator.ts";
import type { RunInSandbox, SandboxPolicy } from "../sandbox/contract.ts";
import { runInSandbox } from "../sandbox/runner.ts";
import type { PipelineAdapters } from "./types.ts";

export function createExecutionAdapters(
  trustedPolicy: SandboxPolicy,
  sandbox: RunInSandbox = runInSandbox,
  router: Pick<ModelRouter, "evaluate"> = loadModelRouter({ MODEL_OFF: "1" }),
): PipelineAdapters {
  // A process restart loses this authorization and therefore cannot run an
  // unconfirmed previous attempt a second time. A durable reconciliation API
  // can replace this conservative, bounded record.
  const cleanRetries = new Map<string, number>();
  return {
    awaitsSandboxCleanup: true,
    async runInSandbox(claim, signal) {
      const priorCleanup = cleanRetries.get(claim.jobId);
      cleanRetries.delete(claim.jobId);
      if (claim.attemptNumber > 1 && priorCleanup !== claim.attemptNumber) {
        return {
          kind: "infrastructure_error",
          code: "attempt_cleanup_unconfirmed",
          retryable: false,
          cleanupSucceeded: false,
        };
      }
      const { limits } = claim;
      const policy: SandboxPolicy = {
        ...trustedPolicy,
        compile: {
          ...trustedPolicy.compile,
          wallTimeMs: Math.min(
            trustedPolicy.compile.wallTimeMs,
            limits.compileMs,
          ),
        },
        run: {
          cpuTimeMs: Math.min(trustedPolicy.run.cpuTimeMs, limits.cpuMs),
          wallTimeMs: Math.min(trustedPolicy.run.wallTimeMs, limits.wallMs),
          memoryBytes: Math.min(
            trustedPolicy.run.memoryBytes,
            limits.memoryMb * 1024 * 1024,
          ),
          pids: Math.min(trustedPolicy.run.pids, limits.processes),
          outputBytes: Math.min(
            trustedPolicy.run.outputBytes,
            limits.outputBytes,
          ),
        },
      };
      const result = await sandbox(
        {
          submissionId: claim.submissionId,
          source: {
            text: claim.source,
            sha256: createHash("sha256").update(claim.source).digest("hex"),
          },
          tests: claim.tests.map((row, index) => ({
            ...row,
            id: `case-${index + 1}`,
          })),
        },
        policy,
        { runId: claim.attemptId, signal },
      );
      const cleanupSucceeded =
        result.cleanup.succeeded &&
        result.cleanup.remainingContainerIds.length === 0;
      if (
        result.kind === "infrastructure_error" ||
        !cleanupSucceeded ||
        signal.aborted
      ) {
        const retryable =
          cleanRetries.size < 256 &&
          cleanupSucceeded &&
          (result.kind === "completed" || result.retryable);
        if (retryable) {
          cleanRetries.set(claim.jobId, claim.attemptNumber + 1);
        }
        return {
          kind: "infrastructure_error",
          code:
            result.kind === "infrastructure_error"
              ? result.code
              : cleanupSucceeded
                ? "cancelled"
                : "cleanup_failed",
          retryable,
          cleanupSucceeded,
        };
      }
      return {
        kind: "judged",
        judgeStatus: result.judgeStatus,
        tests: result.tests.map(({ result }) => result.status),
      };
    },
    checkSubmission(input, signal) {
      return checkSubmission(
        { ...input, labId: String(input.labId ?? input.solution) },
        router,
        signal,
      );
    },
  };
}
