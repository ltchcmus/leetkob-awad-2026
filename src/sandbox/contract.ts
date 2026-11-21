/** PROPOSED: sandbox-only boundary; worker/API integration awaits owner ACK. */
export type JudgeStatus = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE";

export type SourceSnapshot = Readonly<{
  text: string;
  sha256: string; // SHA-256 of the exact UTF-8 bytes, without newline normalization.
}>;

export type SandboxRequest = Readonly<{
  submissionId: string; // Correlation only; never interpreted as a path or command.
  source: SourceSnapshot;
  tests: readonly Readonly<{
    id: string;
    input: string;
    expectedOutput: string;
  }>[];
}>;

export type PhaseLimits = Readonly<{
  cpuTimeMs: number; // Aggregate CPU budget, including descendants; not CPU quota.
  wallTimeMs: number;
  memoryBytes: number;
  pids: number;
  outputBytes: number; // Combined captured stdout + stderr UTF-8 bytes per phase.
}>;

/** Trusted configuration. Never deserialize this from a student request. */
export type SandboxPolicy = Readonly<{
  version: string;
  image: string; // Digest reference; no mutable tag at execution time.
  compilerProfile: "cpp17-o2"; // Fixed argv: g++ -std=c++17 -O2; no user flags.
  cpuQuota: number;
  compile: PhaseLimits;
  run: PhaseLimits;
  workBytes: number; // Private bounded tmpfs, shared by neither host nor other jobs.
}>;

export type PhaseReason =
  | "ok"
  | "wrong_answer"
  | "compile_error"
  | "cpu_time"
  | "wall_clock"
  | "memory"
  | "output_limit"
  | "signal"
  | "exit_code";

export type PhaseResult = Readonly<{
  status: JudgeStatus;
  reason: PhaseReason;
  stdout: string;
  stderr: string;
  capturedBytes: number;
  outputTruncated: boolean;
  cpuTimeMs: number;
  wallTimeMs: number;
  memoryPeakBytes: number;
  oomKilled: boolean;
}>;

/** Allowlisted evidence from actual Docker inspect, never environment values. */
export type IsolationEvidence = Readonly<{
  containerId: string;
  runId: string;
  phase: "compile" | "run";
  imageDigest: string;
  networkMode: string;
  user: string;
  privileged: boolean;
  readonlyRootfs: boolean;
  capDrop: readonly string[];
  noNewPrivileges: boolean;
  mounts: readonly Readonly<{ type: string; destination: string }>[];
  memoryBytes: number;
  memorySwapBytes: number;
  pids: number;
  cpuQuota: number;
  environmentNames: readonly string[];
}>;

export type CleanupReport = Readonly<{
  attempted: boolean;
  succeeded: boolean;
  remainingContainerIds: readonly string[];
}>;

export type SandboxResult =
  | Readonly<{
      kind: "completed";
      submissionId: string;
      sourceSha256: string;
      policyVersion: string;
      judgeStatus: JudgeStatus;
      compile: PhaseResult;
      tests: readonly Readonly<{ testId: string; result: PhaseResult }>[];
      isolation: readonly IsolationEvidence[];
      cleanup: CleanupReport;
    }>
  | Readonly<{
      kind: "infrastructure_error";
      code:
        | "invalid_request"
        | "invalid_policy"
        | "daemon_unavailable"
        | "image_unavailable"
        | "compiler_unavailable"
        | "container_start_failed"
        | "controller_timeout"
        | "cancelled"
        | "measurement_unavailable"
        | "controller_error"
        | "cleanup_failed";
      retryable: boolean;
      cleanup: CleanupReport;
    }>;

export type SandboxContext = Readonly<{
  runId: string; // Trusted UUID; label key is leetkob.sandbox.run.
  signal: AbortSignal;
}>;

/** Expected export of runner.ts in the implementation change; not implemented here. */
export type RunInSandbox = (
  request: SandboxRequest,
  policy: SandboxPolicy,
  context: SandboxContext,
) => Promise<SandboxResult>;
