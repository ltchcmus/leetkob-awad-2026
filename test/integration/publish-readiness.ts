import assert from "node:assert/strict";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { createApp } from "../../src/app.ts";
import type { Principal } from "../../src/repository.ts";
import { people, workflowFixture } from "../helpers/workflow.ts";

export async function httpFixture(t: TestContext) {
  const fixture = workflowFixture(t);
  const identities: Record<string, Principal> = people;
  const server = createApp({
    repository: fixture.repo,
    authenticate: (request) =>
      identities[(request.headers.authorization ?? "").replace(/^Bearer /, "")],
    clock: () => new Date(fixture.now + 60_000),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const publish = (token = "ta", labId = fixture.labId) =>
    fetch(`http://127.0.0.1:${address.port}/v1/labs/${labId}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  const snapshot = () =>
    JSON.stringify(
      ["publications", "published_marks", "publication_audit"].map((table) =>
        fixture.repo.db.prepare(`SELECT * FROM ${table}`).all(),
      ),
    );
  return { ...fixture, publish, snapshot };
}

export function finishChecking(fixture: ReturnType<typeof workflowFixture>) {
  const claim = fixture.repo.claimJob("integration-fixture", {
    now: fixture.now,
    leaseMs: 30_000,
  });
  assert.ok(claim);
  fixture.repo.recordJudgeResult(
    claim,
    { judgeStatus: "AC", tests: ["AC"] },
    fixture.now,
  );
  fixture.repo.completeChecking(
    claim,
    claim.constraints.map((c) => ({
      constraintId: c.id,
      verdict: "unsure",
      source: "guardrail",
      evidence: [],
      reason: "offline_fixture",
    })),
    fixture.now,
  );
}
