import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeProvider } from "../src/ai/providers/fake.ts";
import { ModelRouter } from "../src/ai/router.ts";
import { orchestrate } from "../src/checker/orchestrator.ts";
import { loadModelRouter } from "../src/ai/config.ts";
import { gemini } from "../src/ai/providers/gemini.ts";
import { nvidia } from "../src/ai/providers/nvidia.ts";
import type { CallLog, ModelProvider, ProviderResult } from "../src/ai/types.ts";

const limits = { requestsPerMinute: 100, tokensPerMinute: 1_000_000, concurrency: 2 };
const input = {
  labId: "internal-lab", statement: "Return a value", source: "// private comments\nint f(){return 1;}\n",
  constraints: [{ id: "c1", text: "Returns a constant", deductionTenths: 30 }],
};
const result = (value: unknown): ProviderResult => ({ kind: "success", text: JSON.stringify(value) });
const valid = [{ constraintId: "c1", verdict: "violation", evidence: [{ line: 2, text: "int f(){return 1;}" }] }];
const ok = result(valid);
const opts = { off: false, timeoutMs: 250, maxAttempts: 2, maxOutputTokens: 512, maxLabCalls: 10, maxLabTokens: 100_000 };
function run(primary: ProviderResult | ((signal: AbortSignal) => Promise<ProviderResult>), fallback = ok, options = opts) {
  const a = new FakeProvider("fake-primary", limits, [primary]);
  const b = new FakeProvider("fake-fallback", limits, [fallback]);
  const logs: CallLog[] = [];
  const router = new ModelRouter([a, b], options, (entry) => logs.push(entry));
  return { a, b, logs, router };
}
for (const [name, payload] of [
  ["invalid JSON", "{"], ["prose", "Here is the answer: []"], ["code fence", "```json\n[]\n```"],
  ["missing ID", "[]"], ["duplicate ID", JSON.stringify([...valid, ...valid])],
  ["unknown ID", JSON.stringify([{ ...valid[0], constraintId: "other" }])],
  ["invalid verdict", JSON.stringify([{ ...valid[0], verdict: "maybe" }])],
  ["out-of-range line", JSON.stringify([{ ...valid[0], evidence: [{ line: 99, text: "x" }] }])],
  ["wrong evidence text", JSON.stringify([{ ...valid[0], evidence: [{ line: 2, text: "x" }] }])],
  ["attempted deduction", JSON.stringify([{ ...valid[0], deductionTenths: 100 }])],
] as const) {
  test(name + " fails closed with no fallback", async () => {
    const { router, b } = run({ kind: "success", text: payload });
    assert.equal((await router.evaluate(input))[0]?.verdict, "unsure");
    assert.equal(b.calls.length, 0);
    assert.equal(input.constraints[0]?.deductionTenths, 30);
  });
}

for (const reason of ["rate_limit", "unavailable", "connection"] as const) {
  test(reason + " permits one fallback within quota", async () => {
    const { router, a, b } = run({ kind: "failure", reason });
    assert.equal((await router.evaluate(input))[0]?.verdict, "violation");
    assert.equal(a.calls.length, 1);
    assert.equal(b.calls.length, 1);
  });
}

test("both providers unavailable stops after two attempts", async () => {
  const unavailable = { kind: "failure", reason: "unavailable" } as const;
  const { router, a, b } = run(unavailable, unavailable);
  assert.equal((await router.evaluate(input))[0]?.verdict, "unsure");
  assert.equal(a.calls.length + b.calls.length, 2);
});

test("safety refusal never routes to fallback", async () => {
  const { router, b } = run({ kind: "failure", reason: "refusal" });
  assert.equal((await router.evaluate(input))[0]?.verdict, "unsure");
  assert.equal(b.calls.length, 0);
});

test("timeout aborts provider and never triggers fallback", async () => {
  let seen: AbortSignal | undefined;
  const { router, b } = run((signal) => { seen = signal; return new Promise(() => {}); }, ok, { ...opts, timeoutMs: 20 });
  assert.equal((await router.evaluate(input))[0]?.reason, "timeout");
  assert.equal(seen?.aborted, true);
  assert.equal(b.calls.length, 0);
});
test("one deadline covers primary and fallback", async () => {
  const { router, a, b } = run(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { kind: "failure", reason: "unavailable" };
  }, ok, { ...opts, timeoutMs: 90 });
  b.steps[0] = () => new Promise(() => {});
  assert.equal((await router.evaluate(input))[0]?.reason, "timeout");
  assert.equal(a.calls[0]?.signal, b.calls[0]?.signal);
  assert.equal(b.calls[0]?.signal.aborted, true);
});
test("caller cancellation aborts an in-flight request", async () => {
  const { router, a, b } = run(() => new Promise(() => {}));
  const ctrl = new AbortController();
  const pending = router.evaluate(input, ctrl.signal);
  ctrl.abort();
  assert.equal((await pending)[0]?.reason, "cancelled");
  assert.equal(a.calls[0]?.signal.aborted, true);
  assert.equal(b.calls.length, 0);
});

test("budget, quota and MODEL_OFF deny dispatch", async () => {
  const { router, a } = run(ok, ok, { ...opts, maxLabCalls: 1 });
  assert.equal((await router.evaluate(input))[0]?.verdict, "violation");
  assert.equal((await router.evaluate(input))[0]?.reason, "budget");
  assert.equal(a.calls.length, 1);
  const limited = new FakeProvider("fake", { ...limits, tokensPerMinute: 1 }, [ok]);
  assert.equal((await new ModelRouter([limited], opts).evaluate(input))[0]?.reason, "quota");
  assert.equal(limited.calls.length, 0);
  let created = false;
  const off = loadModelRouter({ MODEL_OFF: "1" }, { fetch: () => { created = true; throw Error("unexpected network"); } });
  assert.equal((await off.evaluate(input))[0]?.reason, "model_off");
  assert.equal(created, false);
});
test("unverified config and paid toggle provide no dispatch", async () => {
  for (const paid of ["false","true"]) {
    const router = loadModelRouter({ MODEL_OFF: "0", LLM_PRIMARY: "gemini", LLM_ALLOW_PAID: paid, LLM_LAB_BUDGET_USD: "0" }, { fetch: () => { throw Error("unexpected network"); } });
    assert.equal((await router.evaluate(input))[0]?.verdict, "unsure");
  }
});

test("hard-rule pass and hard-rule unsure are final", async () => {
  const { router, a } = run(ok);
  const results = await orchestrate(input, router, [
    { kind: "hard-rule", constraintId: "c1", verdict: "unsure", evidence: [] },
  ]);
  assert.equal(results[0]?.source, "hard-rule");
  assert.equal(a.calls.length, 0);
  const unknown = await orchestrate(input, router, []);
  assert.equal(unknown[0]?.verdict, "unsure");
  assert.equal(a.calls.length, 0);
  const decided = await orchestrate(input, router, [{ kind: "hard-rule", constraintId: "c1", verdict: "pass", evidence: [] }]);
  assert.equal(decided[0]?.verdict, "pass");
  assert.equal(a.calls.length, 0);
});
test("prompt excludes identity, comments, deduction and internal lab IDs; logs allowlist metadata", async () => {
  const { router, a, logs } = run(ok);
  await router.evaluate({ ...input, source: input.source + 'const char* x = "Student Name";\n', identities: ["Student Name"] });
  const prompt = JSON.stringify(a.calls[0]?.request);
  for (const forbidden of ["private comments", "Student Name", "deductionTenths", "internal-lab"]) assert.ok(!prompt.includes(forbidden));
  const log = JSON.stringify(logs);
  for (const forbidden of ["int f()", "Returns a constant", "internal-lab", "providerRequestId"]) assert.ok(!log.includes(forbidden));
});
test("known credentials embedded in model input block dispatch", async () => {
  const { router, a } = run(ok, ok, { ...opts, sensitiveValues: ["synthetic-do-not-send"] } as typeof opts);
  assert.equal((await router.evaluate({ ...input, statement: "synthetic-do-not-send" }))[0]?.reason, "unsafe_input");
  assert.equal(a.calls.length, 0);
});
test("Gemini and NVIDIA adapters use text-only provider envelopes and actual metadata", async () => {
  const fakeFetch: typeof fetch = async (url, init) => {
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("generativelanguage")) {
      assert.ok(body.contents[0].parts[0].text);
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "synthetic");
      return Response.json({ responseId: "g-real-id", usageMetadata: { promptTokenCount: 3 }, candidates: [{ finishReason: "STOP", content: { parts: [{ text: "[]" }] } }] });
    }
    assert.equal(String(url), "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(body.stream, false);
    assert.equal(typeof body.messages[0].content, "string");
    return Response.json({ id: "n-real-id", usage: { prompt_tokens: 3 }, choices: [{ finish_reason: "stop", message: { content: "[]" } }] });
  };
  const providers: ModelProvider[] = [gemini("g-model", "synthetic", limits, fakeFetch), nvidia("n-model", "synthetic", limits, fakeFetch)];
  for (const [i, provider] of providers.entries()) {
    const value = await provider.generate({ prompt: "{}", maxOutputTokens: 20 }, new AbortController().signal);
    assert.equal(value.kind, "success");
    assert.equal(value.providerRequestId, i === 0 ? "g-real-id" : "n-real-id");
    assert.equal(value.usage?.inputTokens, 3);
  }
});
