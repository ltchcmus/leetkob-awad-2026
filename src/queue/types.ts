export type JudgeVerdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE";
export type Verdict = "pass" | "violation" | "unsure";
export type EvidenceLine = { line: number; text: string };
export type Constraint = { id: string; text: string; deductionTenths: number };
export type LabTest = { input: string; expectedOutput: string };
export type Limits = {
  cpuMs: number;
  wallMs: number;
  memoryMb: number;
  processes: number;
  outputBytes: number;
  compileMs: number;
};
export type ConstraintEvaluation = {
  constraintId: string;
  verdict: Verdict;
  source: "hard-rule" | "model" | "guardrail";
  evidence: EvidenceLine[];
  reason?: string;
};
export type JudgeResult = { judgeStatus: JudgeVerdict; tests: JudgeVerdict[] };
export type SandboxOutcome =
  | ({ kind: "judged" } & JudgeResult)
  | { kind: "infrastructure_error"; code: string };
export type Claim = {
  jobId: string;
  submissionId: string;
  labId: number;
  attemptId: string;
  attemptNumber: number;
  leaseToken: string;
  leaseExpiresAt: number;
  source: string;
  statement: string;
  tests: LabTest[];
  constraints: Constraint[];
  limits: Limits;
  judgeResult: JudgeResult | null;
};
export type SubmissionReceipt = {
  submissionId: string;
  status: "queued";
  createdAt: string;
};
export type StudentStatus = {
  submissionId: string;
  status: "queued" | "running" | "retrying" | "completed" | "failed";
  judgeVerdict: JudgeVerdict | null;
  testVerdicts: JudgeVerdict[];
  createdAt: string;
};
export type ReviewItem = {
  reviewId: string;
  submissionId: string;
  constraintId: string;
  constraintText: string;
  deductionTenths: number;
  verdict: Verdict;
  evidence: EvidenceLine[];
  reason: string | null;
  decision: "pass" | "violation" | null;
  reviewVersion: number;
};
export type ReviewDecision = {
  decision: "pass" | "violation";
  evidence: EvidenceLine[];
  reason: string;
  expectedVersion: number;
};
export type WorkflowErrorCode =
  | "invalid-input"
  | "deadline-passed"
  | "idempotency-conflict"
  | "lease-lost"
  | "invalid-checker-result"
  | "review-conflict"
  | "stale-submission"
  | "already-published";
export class WorkflowError extends Error {
  readonly code: WorkflowErrorCode;
  constructor(code: WorkflowErrorCode) {
    super(code);
    this.code = code;
  }
}
