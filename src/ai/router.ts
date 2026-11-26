import { randomUUID } from "node:crypto";
import { LabBudget } from "./budget.ts";
import { callLog } from "./call-log.ts";
import { canFallback, CircuitBreaker } from "./circuit-breaker.ts";
import { makePrompt } from "./prompt.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { validateModel } from "./schema.ts";
import type {
  CallLog,
  ConstraintResult,
  FailureReason,
  ModelProvider,
  ModelRequest,
  ProviderResult,
  RouterOptions,
  SemanticInput,
} from "./types.ts";

export function unsure(
  constraintId: string,
  reason: FailureReason,
): ConstraintResult {
  return {
    constraintId,
    verdict: "unsure",
    evidence: [],
    source: "guardrail",
    reason,
  };
}
type Slot = {
  provider: ModelProvider;
  limiter: RateLimiter;
  breaker: CircuitBreaker;
};

async function boundedCall(
  provider: ModelProvider,
  request: ModelRequest,
  signal: AbortSignal,
  abortReason: () => FailureReason,
  release: () => void,
): Promise<ProviderResult> {
  let stop: () => void = () => {};
  const aborted = new Promise<ProviderResult>((resolve) => {
    stop = () => resolve({ kind: "failure", reason: abortReason() });
    signal.addEventListener("abort", stop, { once: true });
  });
  try {
    if (signal.aborted) {
      release();
      return { kind: "failure", reason: abortReason() };
    }
    // Keep the concurrency reservation until an abort-ignoring transport actually settles.
    const pending = (async () => provider.generate(request, signal))()
      .catch((): ProviderResult => ({ kind: "failure", reason: "rejected" }))
      .finally(release);
    const result = await Promise.race([aborted, pending]);
    return signal.aborted ? { kind: "failure", reason: abortReason() } : result;
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

export class ModelRouter {
  private readonly budget: LabBudget;
  private readonly options: RouterOptions;
  private readonly slots: Slot[];
  private readonly write: (entry: CallLog) => void;

  constructor(
    providers: readonly ModelProvider[],
    options: RouterOptions,
    write: (entry: CallLog) => void = () => {},
  ) {
    this.options = {
      ...options,
      sensitiveValues: [...(options.sensitiveValues ?? [])],
      verifiedFreeProviders: [...(options.verifiedFreeProviders ?? [])],
    };
    this.write = write;
    this.budget = new LabBudget(options.maxLabCalls, options.maxLabTokens);
    this.slots = providers.slice(0, 2).map((provider) => ({
      provider,
      limiter: new RateLimiter(provider.quota),
      breaker: new CircuitBreaker(),
    }));
  }

  async evaluate(
    input: SemanticInput,
    external?: AbortSignal,
  ): Promise<ConstraintResult[]> {
    const ids = input.constraints.map((c) => c.id);
    const reject = (reason: FailureReason) =>
      ids.map((id) => unsure(id, reason));
    if (!ids.length) return [];
    if (this.options.off) return reject("model_off");
    if (external?.aborted) return reject("cancelled");
    if (!this.slots.length) return reject("unconfigured");
    const secrets = this.options.sensitiveValues ?? [];
    const prepared = makePrompt(input, secrets);
    if (!prepared) return reject("unsafe_input");
    const ctrl = new AbortController();
    const cancel = () => ctrl.abort();
    external?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, this.options.timeoutMs);
    try {
      return await this.route(input.labId, prepared, ctrl.signal, () =>
        external?.aborted ? "cancelled" : "timeout",
      );
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", cancel);
    }
  }

  private async route(
    labId: string,
    prepared: NonNullable<ReturnType<typeof makePrompt>>,
    signal: AbortSignal,
    abortReason: () => FailureReason,
  ): Promise<ConstraintResult[]> {
    const reject = (reason: FailureReason) =>
      prepared.ids.map((id) => unsure(id, reason));
    const tokens =
      Buffer.byteLength(prepared.prompt) + 64 + this.options.maxOutputTokens;
    const correlationId = randomUUID();
    let outcome: FailureReason = "unavailable";
    let attempt = 0;
    for (const { provider, limiter, breaker } of this.slots) {
      if (attempt >= this.options.maxAttempts) break;
      if (signal.aborted) return reject(abortReason());
      if (!this.budget.allows(labId, tokens)) return reject("budget");
      if (!breaker.acquire(Date.now())) {
        outcome = "circuit_open";
        continue;
      }
      const release = limiter.reserve(tokens, Date.now());
      if (!release) {
        breaker.defer();
        outcome = "quota";
        continue;
      }
      this.budget.charge(labId, tokens);
      const start = performance.now();
      attempt++;
      const result = await boundedCall(
        provider,
        {
          prompt: prepared.prompt,
          maxOutputTokens: this.options.maxOutputTokens,
        },
        signal,
        abortReason,
        release,
      );
      breaker.settle(result, Date.now());
      const validation =
        result.kind === "success"
          ? validateModel(
              result.text,
              prepared.ids,
              prepared.original,
              prepared.visible,
            )
          : result;
      const logged =
        "reason" in validation
          ? { ...result, kind: "failure" as const, reason: validation.reason }
          : result;
      try {
        this.write(
          callLog(
            correlationId,
            attempt,
            provider,
            logged,
            performance.now() - start,
            this.options.verifiedFreeProviders?.includes(provider.id) ?? false,
            this.options.sensitiveValues ?? [],
          ),
        );
      } catch {
        /* A log sink cannot trigger another dispatch. */
      }
      if ("results" in validation) return validation.results;
      outcome = validation.reason;
      if (!canFallback(outcome)) break;
      // The failing provider is never retried in this evaluation. Its breaker honors Retry-After.
    }
    return reject(outcome);
  }
}
