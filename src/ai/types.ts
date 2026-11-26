export type EvidenceLine = { line: number; text: string };
export type Verdict = "pass" | "violation" | "unsure";
export type SemanticInput = {
  labId: string;
  statement: string;
  source: string;
  identities?: readonly string[];
  constraints: readonly { id: string; text: string }[];
};
export type FailureReason =
  | "model_off"
  | "unconfigured"
  | "budget"
  | "quota"
  | "circuit_open"
  | "unsafe_input"
  | "invalid_schema"
  | "invalid_evidence"
  | "timeout"
  | "cancelled"
  | "rate_limit"
  | "unavailable"
  | "connection"
  | "refusal"
  | "rejected";
export type ConstraintResult = {
  constraintId: string;
  verdict: Verdict;
  evidence: EvidenceLine[];
  source: "model" | "guardrail" | "hard-rule";
  reason?: FailureReason;
};
export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
};
export type ProviderResult = {
  httpStatus?: number;
  modelActual?: string;
  providerRequestId?: string;
  providerResponseId?: string;
  usage?: Usage;
  retryAfterMs?: number;
} & (
  { kind: "success"; text: string } | { kind: "failure"; reason: FailureReason }
);
export type Quota = {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrency: number;
  requestsPerDay?: number;
};
export type ModelRequest = { prompt: string; maxOutputTokens: number };
export interface ModelProvider {
  id: string;
  model: string;
  quota: Quota;
  generate(request: ModelRequest, signal: AbortSignal): Promise<ProviderResult>;
}
export type CallLog = {
  correlationId: string;
  attempt: number;
  provider: string;
  model: string;
  modelActual?: string;
  httpStatus?: number;
  providerRequestId?: string;
  providerResponseId?: string;
  usage?: Usage;
  latencyMs: number;
  outcome: "success" | FailureReason;
} & (
  | { pricing: "verified_free"; cost: { amount: 0; currency: "USD" } }
  | { pricing: "synthetic" | "unverified" }
);
export type RouterOptions = {
  off: boolean;
  timeoutMs: number;
  maxAttempts: number;
  maxOutputTokens: number;
  maxLabCalls: number;
  maxLabTokens: number;
  sensitiveValues?: readonly string[];
  verifiedFreeProviders?: readonly string[];
};
