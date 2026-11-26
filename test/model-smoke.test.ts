import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModelRouter } from "../src/ai/config.ts";
import { runProviderSmoke } from "../src/ai/smoke.ts";
import type { CallLog } from "../src/ai/types.ts";

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

test("configured Gemini 503 routes once through the NVIDIA adapter", async () => {
  const hosts: string[] = [];
  const logs: CallLog[] = [];
  const router = loadModelRouter(
    {
      ...env,
      LLM_PRIMARY: "gemini",
      LLM_FALLBACK: "nvidia",
      LLM_MAX_ATTEMPTS: "2",
      LLM_LAB_MAX_CALLS: "2",
    },
    {
      async fetch(url) {
        const host = new URL(String(url)).hostname;
        hosts.push(host);
        if (host === "generativelanguage.googleapis.com")
          return new Response(null, { status: 503 });
        return Response.json({
          choices: [{ finish_reason: "stop", message: { content: valid } }],
        });
      },
      write(entry) {
        logs.push(entry);
      },
    },
  );
  const [result] = await router.evaluate({
    labId: "synthetic-smoke",
    statement: "Implement answer() so it returns the integer 2.",
    source: "int answer() {\n  return 1;\n}\n",
    constraints: [{ id: "returns-two", text: "answer() must return 2." }],
  });
  assert.equal(result?.verdict, "violation");
  assert.deepEqual(result?.evidence, [{ line: 2, text: "  return 1;" }]);
  assert.deepEqual(hosts, [
    "generativelanguage.googleapis.com",
    "integrate.api.nvidia.com",
  ]);
  assert.deepEqual(
    logs.map(({ provider, attempt, httpStatus }) => [
      provider,
      attempt,
      httpStatus,
    ]),
    [
      ["gemini", 1, 503],
      ["nvidia", 2, 200],
    ],
  );
  assert.equal(logs[0]?.correlationId, logs[1]?.correlationId);
});

test("manual smoke runs the selected Gemini replacement with minimal thinking", async () => {
  const model = "gemini-3.1-flash-lite";
  let thinkingLevel: string | undefined;
  const evidence = await runProviderSmoke(
    "gemini",
    {
      ...env,
      GEMINI_MODEL: model,
      GEMINI_FREE_VERIFIED_MODEL: model,
    },
    async (_url, init) => {
      thinkingLevel = JSON.parse(String(init?.body)).generationConfig
        .thinkingConfig.thinkingLevel;
      return Response.json({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: valid }] } },
        ],
      });
    },
  );
  assert.equal(thinkingLevel, "MINIMAL");
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.calls, 1);
  assert.equal(evidence.modelRequested, model);
  assert.equal(
    evidence.pricingSource,
    "https://aistudio.google.com/docs/pricing#gemini-3.1-flash-lite",
  );
});
