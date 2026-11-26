import { gemini } from "./providers/gemini.ts";
import { nvidia, NVIDIA_BASE_URL } from "./providers/nvidia.ts";
import { ModelRouter } from "./router.ts";
import type { CallLog, ModelProvider, RouterOptions } from "./types.ts";

type Environment = Readonly<Record<string, string | undefined>>;

function positive(value: string | undefined, max: number) {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= max ? n : undefined;
}

export function loadModelRouter(
  env: Environment = process.env,
  dependencies: {
    fetch?: typeof fetch;
    write?: (entry: CallLog) => void;
  } = {},
): ModelRouter {
  const options: RouterOptions = {
    off: env.MODEL_OFF !== "0",
    timeoutMs: positive(env.LLM_TIMEOUT_MS, 120_000) ?? 30_000,
    maxAttempts: positive(env.LLM_MAX_ATTEMPTS, 2) ?? 2,
    maxOutputTokens: positive(env.LLM_MAX_OUTPUT_TOKENS, 8192) ?? 2048,
    maxLabCalls: positive(env.LLM_LAB_MAX_CALLS, 100_000) ?? 0,
    maxLabTokens: positive(env.LLM_LAB_MAX_TOKENS, 1_000_000_000) ?? 0,
    sensitiveValues: [env.GEMINI_API_KEY ?? "", env.NVIDIA_API_KEY ?? ""],
  };
  const disabled = () => new ModelRouter([], options, dependencies.write);
  if (
    options.off ||
    env.LLM_ALLOW_PAID !== "false" ||
    env.LLM_LAB_BUDGET_USD !== "0" ||
    !options.maxLabCalls ||
    !options.maxLabTokens
  )
    return disabled();
  for (const [key, max] of [
    ["LLM_TIMEOUT_MS", 120_000],
    ["LLM_MAX_ATTEMPTS", 2],
    ["LLM_MAX_OUTPUT_TOKENS", 8192],
  ] as const) {
    if (env[key] !== undefined && !positive(env[key], max)) return disabled();
  }
  if (
    (env.LLM_PRIMARY !== "gemini" && env.LLM_PRIMARY !== "nvidia") ||
    (env.LLM_FALLBACK &&
      env.LLM_FALLBACK !== "gemini" &&
      env.LLM_FALLBACK !== "nvidia") ||
    env.LLM_PRIMARY === env.LLM_FALLBACK
  )
    return disabled();
  const providers: ModelProvider[] = [];
  for (const name of [env.LLM_PRIMARY, env.LLM_FALLBACK]) {
    if (name !== "gemini" && name !== "nvidia") continue;
    const prefix = name.toUpperCase();
    const model = env[prefix + "_MODEL"];
    const key = env[prefix + "_API_KEY"];
    const requestsPerMinute = positive(env[prefix + "_RPM"], 10_000);
    const requestsPerDay = positive(env[prefix + "_RPD"], 100_000);
    const tokensPerMinute = positive(env[prefix + "_TPM"], 100_000_000);
    const concurrency = positive(env[prefix + "_CONCURRENCY"], 32);
    if (
      env[prefix + "_FREE_VERIFIED_MODEL"] !== model ||
      !model ||
      !/^[\w./-]{1,160}$/u.test(model) ||
      !key ||
      !key.trim() ||
      !requestsPerMinute ||
      !requestsPerDay ||
      !tokensPerMinute ||
      !concurrency
    )
      continue;
    if (
      name === "nvidia" &&
      env.NVIDIA_BASE_URL &&
      env.NVIDIA_BASE_URL !== NVIDIA_BASE_URL
    )
      continue;
    const quota = {
      requestsPerMinute,
      requestsPerDay,
      tokensPerMinute,
      concurrency,
    };
    const factory = name === "gemini" ? gemini : nvidia;
    providers.push(factory(model, key, quota, dependencies.fetch));
  }
  return new ModelRouter(
    providers,
    { ...options, verifiedFreeProviders: providers.map((p) => p.id) },
    dependencies.write,
  );
}
