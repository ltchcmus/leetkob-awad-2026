import type { WorkflowRepository } from "../db/workflow-repository.ts";
import { WorkflowError } from "../queue/types.ts";
import type {
  Claim,
  ConstraintEvaluation,
  JudgeResult,
} from "../queue/types.ts";
import type {
  CheckerOutput,
  PipelineAdapters,
  WorkerOptions,
} from "./types.ts";

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

type JobContext = {
  repo: WorkflowRepository;
  adapters: PipelineAdapters;
  claim: Claim;
  controller: AbortController;
  now: () => number;
  timeoutMs: number;
};

function startHeartbeat(context: JobContext, leaseMs: number): () => void {
  const { repo, claim, now, controller } = context;
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
  return () => clearInterval(heartbeat);
}

async function ensureJudgeResult(context: JobContext): Promise<JudgeResult> {
  const { repo, claim, now, adapters, controller, timeoutMs } = context;
  if (claim.judgeResult !== null) return claim.judgeResult;
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
  return result;
}

function persistCheckerResult(
  context: JobContext,
  result: CheckerOutput,
): void {
  const { repo, claim, now } = context;
  try {
    if (result?.solution !== claim.submissionId)
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

async function checkAccepted(context: JobContext): Promise<void> {
  const { claim, adapters, controller, timeoutMs } = context;
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
  persistCheckerResult(context, result);
}

function leaseLost(error: unknown): boolean {
  return (
    (error instanceof WorkflowError && error.code === "lease-lost") ||
    (error instanceof WorkerFailure && error.message === "lease_lost")
  );
}

function retryFailure(
  context: JobContext,
  error: unknown,
  phase: "sandbox" | "checker",
  options: WorkerOptions,
): "retry" | "lease_lost" {
  if (leaseLost(error)) return "lease_lost";
  const code =
    error instanceof WorkerFailure ? error.message : `${phase}_unavailable`;
  try {
    context.repo.retryJob(
      context.claim,
      code,
      context.now(),
      options.retryDelayMs ?? 1000,
    );
  } catch (retryError) {
    if (leaseLost(retryError)) return "lease_lost";
    throw retryError;
  }
  options.onEvent?.({ event: "job.retry", jobId: context.claim.jobId, code });
  return "retry";
}

export async function processOneJob(
  repo: WorkflowRepository,
  adapters: PipelineAdapters,
  options: WorkerOptions,
): Promise<"idle" | "completed" | "retry" | "lease_lost"> {
  const now = options.now ?? Date.now;
  const leaseMs = options.leaseMs ?? 30_000;
  const timeoutMs = options.adapterTimeoutMs ?? 300_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000)
    throw new Error("Invalid adapter timeout");
  if (options.signal?.aborted) return "idle";
  const claim = repo.claimJob(options.workerId, { now: now(), leaseMs });
  if (!claim) return "idle";
  options.onEvent?.({ event: "job.claimed", jobId: claim.jobId });
  const controller = new AbortController();
  const cancel = () => controller.abort(new WorkerFailure("worker_cancelled"));
  options.signal?.addEventListener("abort", cancel, { once: true });
  const context: JobContext = {
    repo,
    adapters,
    claim,
    controller,
    now,
    timeoutMs,
  };
  const stopHeartbeat = startHeartbeat(context, leaseMs);
  let phase: "sandbox" | "checker" = "sandbox";
  try {
    const judge = await ensureJudgeResult(context);
    if (judge.judgeStatus === "AC") {
      phase = "checker";
      await checkAccepted(context);
    }
    options.onEvent?.({ event: "job.completed", jobId: claim.jobId });
    return "completed";
  } catch (error) {
    return retryFailure(context, error, phase, options);
  } finally {
    stopHeartbeat();
    options.signal?.removeEventListener("abort", cancel);
  }
}
