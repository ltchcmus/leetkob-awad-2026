import { readFileSync } from "node:fs";
import type { SandboxPolicy } from "../sandbox/contract.ts";
import { createExecutionAdapters } from "./execution.ts";
import { loadModelRouter } from "../ai/config.ts";
import { checkSubmission } from "../checker/orchestrator.ts";
import { withDurableQuota } from "./ledger-provider.ts";

const image = process.env.SANDBOX_JUDGE_IMAGE;
if (!image || !/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/u.test(image)) {
  throw new Error("An approved judge manifest digest is required");
}
const reference = JSON.parse(
  readFileSync(new URL("../../judge/policy.json", import.meta.url), "utf8"),
) as Omit<SandboxPolicy, "image">;
export const adapters = createExecutionAdapters({ ...reference, image });
if (process.env.MODEL_OFF === "0") {
  const databasePath = process.env.DATABASE_PATH;
  if (!databasePath || databasePath === ":memory:")
    throw new Error("Durable quota storage is required");
  adapters.checkSubmission = (input, signal) => {
    if (!input.attemptId || input.labId === undefined)
      throw new Error("Trusted attempt context required");
    const router = loadModelRouter(process.env, {
      wrapProvider: (provider) =>
        withDurableQuota(provider, {
          databasePath,
          labId: input.labId!,
          attemptId: input.attemptId!,
        }),
    });
    return checkSubmission(
      { ...input, labId: String(input.labId) },
      router,
      signal,
    );
  };
}
