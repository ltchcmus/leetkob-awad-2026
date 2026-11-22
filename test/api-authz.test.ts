import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { createApp } from "../src/app.ts";
import { syntheticAuthenticator } from "../src/auth.ts";
import { WorkflowRepository } from "../src/db/workflow-repository.ts";
import type { Principal } from "../src/repository.ts";
import { databaseSnapshot, startTestServer } from "./helpers/workflow.ts";

const accounts = {
  admin: {
    token: "test-admin-token",
    principal: { id: "admin", role: "admin" },
  },
  owner: { token: "test-owner-token", principal: { id: "ta-a", role: "ta" } },
  foreign: {
    token: "test-foreign-token",
    principal: { id: "ta-b", role: "ta" },
  },
  student: {
    token: "test-student-token",
    principal: { id: "student-a", role: "student" },
  },
} satisfies Record<string, { token: string; principal: Principal }>;

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-api-authz-"));
  const repository = new WorkflowRepository(join(directory, "app.db"));
  for (const { principal } of Object.values(accounts)) {
    repository.provisionUser(principal);
  }
  const classA = repository.createClass(accounts.admin.principal, "Class A");
  const classB = repository.createClass(accounts.admin.principal, "Class B");
  repository.assignTa(
    accounts.admin.principal,
    classA,
    accounts.owner.principal.id,
  );
  repository.assignTa(
    accounts.admin.principal,
    classB,
    accounts.foreign.principal.id,
  );
  const labId = repository.createLab(accounts.owner.principal, {
    classId: classA,
    statement: "Return normally.",
    deadline: "2026-11-01T00:00:00.000Z",
    tests: [{ input: "", expectedOutput: "" }],
    constraints: [{ id: "C1", text: "Return normally.", deductionTenths: 0 }],
  });
  const server = createApp({
    repository,
    authenticate: syntheticAuthenticator(Object.values(accounts)),
    clock: () => new Date("2026-11-02T00:00:00.000Z"),
  });
  const port = await startTestServer(t, server, repository, directory);
  return {
    labId,
    repository,
    request: (token?: string) =>
      fetch(`http://127.0.0.1:${port}/v1/labs/${labId}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
        },
        body: "{}",
      }),
  };
}

test("4A: malformed and unknown bearer credentials receive 401 without mutation", async (t) => {
  const { repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  for (const token of [undefined, "unknown-token"]) {
    const response = await request(token);
    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get("www-authenticate"),
      'Bearer realm="leetkob"',
    );
    assert.equal(databaseSnapshot(repository), before);
  }
});

test("4A: admin and student roles are forbidden from Publish without mutation", async (t) => {
  const { repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  for (const account of [accounts.admin, accounts.student]) {
    const response = await request(account.token);
    assert.equal(response.status, 403);
    assert.equal(databaseSnapshot(repository), before);
  }
});

test("4A: foreign TA receives non-disclosing 404 from another class without mutation", async (t) => {
  const { repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const response = await request(accounts.foreign.token);
  assert.equal(response.status, 404);
  assert.equal(databaseSnapshot(repository), before);
});
