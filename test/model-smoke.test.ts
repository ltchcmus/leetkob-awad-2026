import assert from "node:assert/strict";
import { test } from "node:test";
import { runProviderSmoke } from "../src/ai/smoke.ts";

const env = {
  MODEL_OFF: "0",
  LLM_ALLOW_PAID: "false",
  LLM_LAB_BUDGET_USD: "0",
  LLM_LAB_MAX_CALLS: "1",
  LLM_LAB_MAX_TOKENS: "10000",
  GEMINI_MODEL: "gemini-3.8-flash",
  GEMINI_FREE_VERIFIED_MODEL: "gemini-3.8-flash",
  GEMINI_API_KEY: "synthetic-gemini",
  GEMINI_RPM: "1",
  GEMINI_RPD: "1",
  GEMINI_TPM: "10000",
  GEMINI_CONCURRENCY: "1",
  NVIDIA_MODEL: "moonshotai/kimi-k3.1-pro",
  NVIDIA_FREE_VERIFIED_MODEL: "moonshotai/kimi-k3.1-pro",
  NVIDIA_API_KEY: "synthetic-nvidia",
  NVIDIA_RPM: "1",
  NVIDIA_RPD: "1",
  NVIDIA_TPM: "10000",
  NVIDIA_CONCURRENCY: "1",
};
const valid = JSON.stringify([
  {
    constraintId: "returns-two",
    verdict: "violation",
    evidence: [{ line: 2, text: "  return 1;" }],
  },
]);

test("manual smoke uses one request for each isolated provider and records metadata", async () => {
  for (const provider of ["gemini", "nvidia"] as const) {
    let calls = 0;
    const evidence = await runProviderSmoke(provider, env, async (url) => {
      calls++;
      assert.equal(
        new URL(String(url)).hostname,
        provider === "gemini"
          ? "generativelanguage.googleapis.com"
          : "integrate.api.nvidia.com",
      );
      return Response.json(
        provider === "gemini"
          ? {
              modelVersion: "server-gemini",
              candidates: [
                { finishReason: "STOP", content: { parts: [{ text: valid }] } },
              ],
            }
          : {
              model: "server-nvidia",
              choices: [{ finish_reason: "stop", message: { content: valid } }],
            },
      );
    });
    assert.equal(calls, 1);
    assert.equal(evidence.status, "pass");
    assert.equal(evidence.modelActual, "server-" + provider);
    assert.equal(evidence.httpStatus, 200);
    assert.equal(evidence.actualBillingEvidence, null);
    assert.equal(evidence.providerRequestId, null);
    assert.equal(evidence.expectedEvidence, true);
  }
});

test("manual smoke blocks unverified access and never falls back on provider failure", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response(null, { status: 503 });
  };
  const blocked = await runProviderSmoke(
    "gemini",
    { ...env, GEMINI_FREE_VERIFIED_MODEL: "" },
    fetcher,
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(calls, 0);
  const failed = await runProviderSmoke("gemini", env, fetcher);
  assert.equal(failed.status, "fail");
  assert.equal(failed.httpStatus, 503);
  assert.equal(failed.result?.verdict, "unsure");
  assert.equal(calls, 1);
});
