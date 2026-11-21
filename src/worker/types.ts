import type {
  Claim,
  Constraint,
  ConstraintEvaluation,
  SandboxOutcome,
} from "../queue/types.ts";

export type CheckerInput = {
  solution: string;
  statement: string;
  source: string;
  constraints: Constraint[];
};
export type CheckerOutput = {
  solution: string;
  evaluations: ConstraintEvaluation[];
};

// These are trusted server adapters. Neither interface permits writes to marks.
export interface PipelineAdapters {
  runInSandbox(job: Claim, signal: AbortSignal): Promise<SandboxOutcome>;
  checkSubmission(
    input: CheckerInput,
    signal: AbortSignal,
  ): Promise<CheckerOutput>;
}

export type WorkerEvent = { event: string; jobId?: string; code?: string };
export type WorkerOptions = {
  workerId: string;
  now?: () => number;
  leaseMs?: number;
  retryDelayMs?: number;
  adapterTimeoutMs?: number;
  signal?: AbortSignal;
  onEvent?: (event: WorkerEvent) => void;
};
