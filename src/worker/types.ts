import type {
  Claim,
  Constraint,
  ConstraintEvaluation,
  SandboxOutcome,
} from "../queue/types.ts";

export type CheckerInput = {
  attemptId?: string;
  identities?: readonly string[];
  labId?: number;
  solution: string;
  statement: string;
  source: string;
  constraints: Constraint[];
};
export type CheckerOutput = {
  solution: string;
  evaluations: ConstraintEvaluation[];
};

type ExecutionOutcome =
  | Extract<SandboxOutcome, { kind: "judged" }>
  | (Extract<SandboxOutcome, { kind: "infrastructure_error" }> & {
      retryable?: boolean;
      cleanupSucceeded?: boolean;
    });

// These are trusted server adapters. Neither interface permits writes to marks.
export interface PipelineAdapters {
  readonly awaitsSandboxCleanup?: true;
  readonly policyVersion?: string;
  runInSandbox(job: Claim, signal: AbortSignal): Promise<ExecutionOutcome>;
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
