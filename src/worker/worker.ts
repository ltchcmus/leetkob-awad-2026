import type { WorkflowRepository } from "../db/workflow-repository.ts";
import { WorkflowError } from "../queue/types.ts";
import type { ConstraintEvaluation } from "../queue/types.ts";
import type { PipelineAdapters, WorkerOptions } from "./types.ts";

class WorkerFailure extends Error {}

function bounded<T>(
  action: (signal: AbortSignal) => Promise<T>,
  controller: AbortController,
  timeoutMs: number,
  code: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (result: { value: T } | { error: unknown }) => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", abort);
      if ("error" in result) reject(result.error);
      else resolve(result.value);
    };
    const abort = () => finish({ error: controller.signal.reason });
    const timer = setTimeout(
      () => controller.abort(new WorkerFailure(code)),
      timeoutMs,
    );
    if (controller.signal.aborted) {
      abort();
      return;
    }
    controller.signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => action(controller.signal))
      .then(
        (value) => finish({ value }),
        (error) => finish({ error }),
      );
  });
}

export async function processOneJob(
  repo: WorkflowRepository,
  adapters: PipelineAdapters,
  options: WorkerOptions,
): Promise<"idle" | "completed" | "retry" | "lease_lost"> {
  const now = options.now ?? Date.now;
  const leaseMs = options.leaseMs ?? 30_000;
  const timeoutMs = options.adapterTimeoutMs ?? 300_000;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000)
    throw new Error("Invalid adapter timeout");
  if (options.signal?.aborted) return "idle";
  const claim = repo.claimJob(options.workerId, { now: now(), leaseMs });
  if (!claim) return "idle";
  options.onEvent?.({ event: "job.claimed", jobId: claim.jobId });
  const controller = new AbortController();
  const cancel = () => controller.abort(new WorkerFailure("worker_cancelled"));
  options.signal?.addEventListener("abort", cancel, { once: true });
  const heartbeat = setInterval(
    () => {
      try {
        if (!repo.renewLease(claim, now(), leaseMs))
          controller.abort(new WorkerFailure("lease_lost"));
      } catch {
        controller.abort(new WorkerFailure("lease_lost"));
      }
    },
    Math.max(25, Math.floor(leaseMs / 3)),
  );
  heartbeat.unref();
  let phase: "sandbox" | "checker" = "sandbox";
  try {
    let judge = claim.judgeResult;
    if (judge === null) {
      const result = await bounded(
        (signal) => adapters.runInSandbox(claim, signal),
        controller,
        timeoutMs,
        "sandbox_timeout",
      );
      if (result.kind === "infrastructure_error") {
        const known = new Set([
          "sandbox_unavailable",
          "image_unavailable",
          "transport_unavailable",
          "sandbox_timeout",
          "sandbox_protocol_error",
        ]);
        throw new WorkerFailure(
          known.has(result.code) ? result.code : "sandbox_unavailable",
        );
      }
      if (result.kind !== "judged")
        throw new WorkerFailure("sandbox_protocol_error");
      repo.recordJudgeResult(claim, result, now());
      judge = result;
    }
    if (judge.judgeStatus === "AC") {
      phase = "checker";
      const input = {
        solution: claim.submissionId,
        statement: claim.statement,
        source: claim.source,
        constraints: claim.constraints,
      };
      const result = await bounded(
        (signal) => adapters.checkSubmission(input, signal),
        controller,
        timeoutMs,
        "checker_timeout",
      );
      try {
        if (!result || result.solution !== input.solution)
          throw new WorkflowError("invalid-checker-result");
        repo.completeChecking(claim, result.evaluations, now());
      } catch (error) {
        if (
          !(error instanceof WorkflowError) ||
          error.code !== "invalid-checker-result"
        )
          throw error;
        const unsure: ConstraintEvaluation[] = claim.constraints.map((c) => ({
          constraintId: c.id,
          verdict: "unsure",
          source: "guardrail",
          evidence: [],
          reason: "invalid_checker_result",
        }));
        repo.completeChecking(claim, unsure, now());
      }
    }
    options.onEvent?.({ event: "job.completed", jobId: claim.jobId });
    return "completed";
  } catch (error) {
    const lost =
      (error instanceof WorkflowError && error.code === "lease-lost") ||
      (error instanceof WorkerFailure && error.message === "lease_lost");
    if (lost) return "lease_lost";
    const code =
      error instanceof WorkerFailure ? error.message : `${phase}_unavailable`;
    try {
      repo.retryJob(claim, code, now(), retryDelayMs);
    } catch (retryError) {
      if (
        retryError instanceof WorkflowError &&
        retryError.code === "lease-lost"
      )
        return "lease_lost";
      throw retryError;
    }
    options.onEvent?.({ event: "job.retry", jobId: claim.jobId, code });
    return "retry";
  } finally {
    clearInterval(heartbeat);
    options.signal?.removeEventListener("abort", cancel);
  }
}
