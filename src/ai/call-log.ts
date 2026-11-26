import { usage } from "./providers/http.ts";
import type { CallLog, ModelProvider, ProviderResult } from "./types.ts";

export function callLog(
  correlationId: string,
  attempt: number,
  provider: ModelProvider,
  result: ProviderResult,
  latencyMs: number,
  verified: boolean,
  secrets: readonly string[],
): CallLog {
  const safe = (value: string) =>
    /^[a-z0-9._:/-]{1,180}$/iu.test(value) &&
    !secrets.some((secret) => secret && value.includes(secret)) &&
    !/^(?:AIza|nvapi-|gh[pousr]_|sk-)/u.test(value);
  const id = result.providerRequestId;
  const responseId = result.providerResponseId;
  const { httpStatus, modelActual } = result;
  const tokens = usage(
    result.usage?.inputTokens,
    result.usage?.outputTokens,
    result.usage?.reasoningTokens,
  );
  return {
    correlationId,
    attempt,
    provider: safe(provider.id) ? provider.id : "redacted",
    model: safe(provider.model) ? provider.model : "redacted",
    ...(modelActual && safe(modelActual) && { modelActual }),
    ...(httpStatus && { httpStatus }),
    ...(id && safe(id) && { providerRequestId: id }),
    ...(responseId && safe(responseId) && { providerResponseId: responseId }),
    ...(Object.keys(tokens).length && { usage: tokens }),
    latencyMs: Math.round(latencyMs),
    outcome: result.kind === "success" ? "success" : result.reason,
    ...(verified
      ? { pricing: "verified_free", cost: { amount: 0, currency: "USD" } }
      : {
          pricing: provider.model === "fake-model" ? "synthetic" : "unverified",
        }),
  };
}
