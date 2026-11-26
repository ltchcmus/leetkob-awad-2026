import type { ProviderResult } from "../types.ts";

export function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}
export function first(value: unknown) {
  return object(Array.isArray(value) ? value[0] : undefined);
}
export function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
export function usage(input: unknown, output: unknown, reasoning: unknown) {
  const inputTokens = count(input);
  const outputTokens = count(output);
  const reasoningTokens = count(reasoning);
  return {
    ...(inputTokens !== undefined && { inputTokens }),
    ...(outputTokens !== undefined && { outputTokens }),
    ...(reasoningTokens !== undefined && { reasoningTokens }),
  };
}

export async function post(
  fetcher: typeof fetch,
  url: string,
  auth: Record<string, string>,
  body: object,
  signal: AbortSignal,
  parse: (payload: Record<string, unknown>) => ProviderResult,
): Promise<ProviderResult> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify(body),
      redirect: "error",
      signal,
    });
  } catch {
    return {
      kind: "failure",
      reason: signal.aborted ? "cancelled" : "connection",
    };
  }
  const id = response.headers.get("x-request-id");
  const metadata = id ? { providerRequestId: id } : {};
  if (!response.ok || response.status !== 200) {
    void response.body?.cancel().catch(() => undefined);
    const reason =
      response.status === 429
        ? "rate_limit"
        : response.status >= 500
          ? "unavailable"
          : "rejected";
    const retry = response.headers.get("retry-after");
    const ms =
      retry && /^\d+$/u.test(retry)
        ? Number(retry) * 1000
        : retry
          ? Date.parse(retry) - Date.now()
          : 0;
    return {
      kind: "failure",
      reason,
      ...metadata,
      ...(Number.isFinite(ms) && ms > 0 && { retryAfterMs: ms }),
    };
  }
  const reader = response.body?.getReader();
  if (!reader)
    return { kind: "failure", reason: "invalid_schema", ...metadata };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 256_000) {
        void reader.cancel().catch(() => undefined);
        return { kind: "failure", reason: "invalid_schema", ...metadata };
      }
      chunks.push(next.value);
    }
  } catch {
    return {
      kind: "failure",
      reason: signal.aborted ? "cancelled" : "connection",
      ...metadata,
    };
  } finally {
    reader.releaseLock();
  }
  try {
    return {
      ...parse(object(JSON.parse(Buffer.concat(chunks).toString("utf8")))),
      ...metadata,
    };
  } catch {
    return { kind: "failure", reason: "invalid_schema", ...metadata };
  }
}
