import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { runInSandbox } from "../../src/sandbox/runner.ts";
import { policyFor } from "./harness.ts";
import type { SandboxRequest } from "../../src/sandbox/contract.ts";

const policy = policyFor(`judge@sha256:${"a".repeat(64)}`);
const source = "int main() {}";
const request: SandboxRequest = {
  submissionId: "unit",
  source: {
    text: source,
    sha256: createHash("sha256").update(source).digest("hex"),
  },
  tests: [{ id: "1", input: "", expectedOutput: "" }],
};
const context = () => ({
  runId: randomUUID(),
  signal: AbortSignal.timeout(10_000),
});

test("admission: source hash mismatch is rejected before Docker access", async () => {
  const value = await runInSandbox(
    { ...request, source: { ...request.source, sha256: "bad" } },
    policy,
    context(),
  );
  assert.equal(value.kind, "infrastructure_error");
  if (value.kind === "infrastructure_error") {
    assert.equal(value.code, "invalid_request");
    assert.equal(value.retryable, false);
  }
});
test("admission: student container flags and environment cannot cross the request boundary", async () => {
  const value = await runInSandbox(
    {
      ...request,
      environment: { MODEL_API_KEY: "public-test-only" },
    } as SandboxRequest,
    policy,
    context(),
  );
  assert.equal(value.kind, "infrastructure_error");
  if (value.kind === "infrastructure_error")
    assert.equal(value.code, "invalid_request");
});
test("admission: mutable image, unlimited resources and duplicate tests are rejected", async () => {
  for (const changed of [
    { ...policy, image: "judge:latest" },
    { ...policy, run: { ...policy.run, memoryBytes: 0 } },
  ]) {
    const value = await runInSandbox(request, changed, context());
    assert.equal(value.kind, "infrastructure_error");
    if (value.kind === "infrastructure_error")
      assert.equal(value.code, "invalid_policy");
  }
  const value = await runInSandbox(
    { ...request, tests: [request.tests[0]!, request.tests[0]!] },
    policy,
    context(),
  );
  assert.equal(value.kind, "infrastructure_error");
  if (value.kind === "infrastructure_error")
    assert.equal(value.code, "invalid_request");
});
test("admission: an already cancelled attempt does not launch Docker", async () => {
  const value = await runInSandbox(request, policy, {
    runId: randomUUID(),
    signal: AbortSignal.abort(),
  });
  assert.equal(value.kind, "infrastructure_error");
  if (value.kind === "infrastructure_error") {
    assert.equal(value.code, "cancelled");
    assert.equal(value.retryable, false);
  }
});

async function fakeDaemon(
  scenario: "image" | "start" | "cleanup",
  check: (calls: string[]) => Promise<void>,
) {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(req.method + " " + req.url);
    res.setHeader("Content-Type", "application/json");
    if (req.url?.includes("/containers/json")) {
      if (scenario === "cleanup" && calls.some((c) => c.includes("/images/"))) {
        res.statusCode = 503;
        res.end("{}");
      } else res.end("[]");
    } else if (req.url?.endsWith("/info"))
      res.end(JSON.stringify({ OSType: "linux" }));
    else if (req.url?.includes("/images/")) {
      if (scenario !== "start") {
        res.statusCode = 404;
        res.end("{}");
      } else
        res.end(
          JSON.stringify({
            Config: {
              Labels: { "leetkob.judge.protocol": "1" },
              User: "65534:65534",
              Env: ["PATH=/usr/bin:/bin"],
            },
          }),
        );
    } else {
      res.statusCode = 500;
      res.end("{}");
    }
  });
  const name =
    process.platform === "win32"
      ? `\\\\.\\pipe\\leetkob-unit-${randomUUID()}`
      : `/tmp/leetkob-unit-${randomUUID()}.sock`;
  await new Promise<void>((resolve) => server.listen(name, resolve));
  const previous = process.env.DOCKER_HOST;
  process.env.DOCKER_HOST =
    process.platform === "win32"
      ? `npipe://${name.replaceAll("\\", "/")}`
      : `unix://${name}`;
  try {
    await check(calls);
  } finally {
    if (previous === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = previous;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
test("infrastructure: missing image is not a student CE and is not automatically retried", async () => {
  await fakeDaemon("image", async (calls) => {
    const value = await runInSandbox(request, policy, context());
    assert.equal(value.kind, "infrastructure_error");
    if (value.kind === "infrastructure_error") {
      assert.equal(value.code, "image_unavailable");
      assert.equal(value.retryable, false);
      assert.equal(value.cleanup.succeeded, true);
    }
    assert.ok(!calls.some((c) => c.includes("/containers/create")));
  });
});
test("infrastructure: start rejection is retryable only after verified cleanup", async () => {
  await fakeDaemon("start", async () => {
    const value = await runInSandbox(request, policy, context());
    assert.equal(value.kind, "infrastructure_error");
    if (value.kind === "infrastructure_error") {
      assert.equal(value.code, "container_start_failed");
      assert.equal(value.retryable, true);
      assert.equal(value.cleanup.succeeded, true);
    }
  });
});
test("infrastructure: cleanup uncertainty overrides any result and prevents retry", async () => {
  await fakeDaemon("cleanup", async () => {
    const value = await runInSandbox(request, policy, context());
    assert.equal(value.kind, "infrastructure_error");
    if (value.kind === "infrastructure_error") {
      assert.equal(value.code, "cleanup_failed");
      assert.equal(value.retryable, false);
      assert.equal(value.cleanup.succeeded, false);
    }
  });
});
