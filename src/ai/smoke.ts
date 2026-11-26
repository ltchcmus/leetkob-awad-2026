import { loadModelRouter } from "./config.ts";
import type { CallLog, SemanticInput } from "./types.ts";

const providers = {
  gemini: {
    model: "gemini-3.8-flash",
    pricingSource: "https://aistudio.google.com/docs/pricing#gemini-3.8-flash",
  },
  nvidia: {
    model: "moonshotai/kimi-k3.1-pro",
    pricingSource: "https://docs.api.nvidia.com/nim/docs/api-quickstart",
  },
};
type Provider = keyof typeof providers;

const evidenceLine = "  return 1;";
const input: SemanticInput = {
  labId: "synthetic-smoke",
  statement: "Implement answer() so it returns the integer 2.",
  source: `int answer() {\n${evidenceLine}\n}\n`,
  constraints: [{ id: "returns-two", text: "answer() must return 2." }],
};

export async function runProviderSmoke(
  provider: Provider,
  env: Readonly<Record<string, string | undefined>>,
  fetcher: typeof fetch = fetch,
) {
  const { model, pricingSource } = providers[provider];
  const prefix = provider.toUpperCase();
  const blocked = {
    provider,
    modelRequested: model,
    pricingSource,
    status: "blocked",
    calls: 0,
  } as const;
  if (env[prefix + "_MODEL"] !== model)
    return { ...blocked, reason: "smoke_model_mismatch" };
  if (env[prefix + "_CONCURRENCY"] !== "1")
    return { ...blocked, reason: "smoke_concurrency_must_be_one" };

  let timestamp: string | undefined;
  let httpStatus: number | undefined;
  let log: CallLog | undefined;
  const router = loadModelRouter(
    { ...env, LLM_PRIMARY: provider, LLM_FALLBACK: "", LLM_MAX_ATTEMPTS: "1" },
    {
      async fetch(url, init) {
        if (timestamp) throw new Error("Smoke request already dispatched");
        timestamp = new Date().toISOString();
        const response = await fetcher(url, init);
        httpStatus = response.status;
        return response;
      },
      write(entry) {
        log = entry;
      },
    },
  );
  const [result] = await router.evaluate(input);
  if (!timestamp)
    return { ...blocked, reason: result?.reason ?? "dispatch_unavailable" };

  const expectedEvidence =
    result?.source === "model" &&
    result.verdict === "violation" &&
    result.evidence.some(
      (line) => line.line === 2 && line.text === evidenceLine,
    );
  return {
    provider,
    modelRequested: model,
    modelActual: log?.modelActual ?? null,
    timestamp,
    correlationId: log?.correlationId ?? null,
    providerRequestId: log?.providerRequestId ?? null,
    providerResponseId: log?.providerResponseId ?? null,
    usage: log?.usage ?? null,
    latencyMs: log?.latencyMs ?? null,
    httpStatus: httpStatus ?? null,
    calls: 1,
    status: expectedEvidence ? "pass" : "fail",
    result,
    evidenceValidation: result?.source === "model" ? "passed" : "not_passed",
    expectedEvidence,
    pricingSource,
    accessTier: log?.pricing === "verified_free" ? "owner_attested_free" : null,
    estimatedCost: log?.pricing === "verified_free" ? log.cost : null,
    actualBillingEvidence: null,
  };
}

if (import.meta.main) {
  const provider = process.argv[2];
  if (provider !== "gemini" && provider !== "nvidia") {
    console.error("Choose one provider: gemini or nvidia");
    process.exitCode = 2;
  } else {
    const evidence = await runProviderSmoke(provider, process.env);
    console.log(JSON.stringify(evidence));
    process.exitCode = evidence.status === "pass" ? 0 : evidence.calls ? 1 : 2;
  }
}
