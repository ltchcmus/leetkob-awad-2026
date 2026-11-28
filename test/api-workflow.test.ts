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
import {
  databaseSnapshot,
  prepareCheckedSubmission,
  startTestServer,
} from "./helpers/workflow.ts";

const now = Date.parse("2026-11-04T08:00:00.000Z");
const accounts = {
  admin: { token: "api-admin", principal: { id: "admin", role: "admin" } },
  owner: { token: "api-owner", principal: { id: "ta-a", role: "ta" } },
  foreign: { token: "api-foreign", principal: { id: "ta-b", role: "ta" } },
  student: {
    token: "api-student",
    principal: { id: "student-a", role: "student" },
  },
  otherStudent: {
    token: "api-other-student",
    principal: { id: "student-b", role: "student" },
  },
} satisfies Record<string, { token: string; principal: Principal }>;

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-api-workflow-"));
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
  repository.enrollStudent(
    accounts.owner.principal,
    classA,
    accounts.student.principal.id,
  );
  const labId = repository.createLab(accounts.owner.principal, {
    classId: classA,
    statement: "Write a return statement.",
    deadline: new Date(now + 60_000).toISOString(),
    tests: [{ input: "", expectedOutput: "" }],
    constraints: [
      {
        id: "C1",
        text: "Do not use `goto`.",
        deductionTenths: 20,
      },
    ],
  });
  const server = createApp({
    repository,
    authenticate: syntheticAuthenticator(Object.values(accounts)),
    clock: () => new Date(now),
  });
  const port = await startTestServer(t, server, repository, directory);
  return {
    classA,
    labId,
    repository,
    request: (
      path: string,
      token: keyof typeof accounts | undefined,
      options: { method?: string; body?: object } = {},
    ) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...(token === undefined
            ? {}
            : { Authorization: `Bearer ${accounts[token].token}` }),
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      }),
  };
}

async function expectProblem(
  response: Response,
  status: number,
  slug?: string,
): Promise<void> {
  assert.equal(response.status, status);
  assert.equal(
    response.headers.get("content-type"),
    "application/problem+json",
  );
  if (slug) {
    const body = (await response.json()) as { type: string };
    assert.equal(body.type, `https://leetkob.example/problems/${slug}`);
  }
}

test("4B: assigned TA creates a persisted lab; foreign TA cannot create in its class", async (t) => {
  const { classA, repository, request } = await fixture(t);
  const body = {
    classId: classA,
    statement: "Sum two integers.",
    deadline: new Date(now + 30_000).toISOString(),
    tests: [{ input: "1 2", expectedOutput: "3" }],
    constraints: [
      {
        id: "C1",
        text: "Do not call `std::sort`.",
        deductionTenths: 10,
      },
    ],
  };
  const created = await request("/v1/labs", "owner", {
    method: "POST",
    body,
  });
  assert.equal(created.status, 201);
  const result = (await created.json()) as { labId: number };
  assert.ok(Number.isSafeInteger(result.labId));
  assert.notEqual(result.labId, 0);
  assert.equal(
    repository.db
      .prepare("SELECT statement FROM lab_details WHERE lab_id = ?")
      .get(result.labId)?.statement,
    body.statement,
  );

  const before = databaseSnapshot(repository);
  for (const account of ["admin", "student"] as const) {
    const denied = await request("/v1/labs", account, {
      method: "POST",
      body,
    });
    await expectProblem(denied, 403);
    assert.equal(databaseSnapshot(repository), before);
  }
  const foreign = await request("/v1/labs", "foreign", {
    method: "POST",
    body,
  });
  await expectProblem(foreign, 404);
  assert.equal(databaseSnapshot(repository), before);
});

test("4B: student status exposes queue progress and judge test verdicts without review data", async (t) => {
  const { labId, repository, request } = await fixture(t);
  const submitted = await request(`/v1/labs/${labId}/submissions`, "student", {
    method: "POST",
    body: { source: "int main() { return 0; }\n" },
  });
  assert.equal(submitted.status, 202);
  const receipt = (await submitted.json()) as {
    submissionId: string;
    status: string;
    createdAt: string;
  };
  assert.match(receipt.submissionId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(
    { ...receipt, submissionId: "" },
    {
      submissionId: "",
      status: "queued",
      createdAt: new Date(now).toISOString(),
    },
  );
  assert.equal(
    repository.db
      .prepare("SELECT source FROM submissions WHERE id = ?")
      .get(receipt.submissionId)?.source,
    "int main() { return 0; }\n",
  );

  const expectedStatus = (input: {
    status: string;
    judgeVerdict: string | null;
    testVerdicts: string[];
  }) => ({
    submissionId: receipt.submissionId,
    createdAt: new Date(now).toISOString(),
    ...input,
  });
  const assertPrivateStatus = (body: Record<string, unknown>) => {
    for (const hidden of [
      "constraintVerdicts",
      "deduction",
      "deductionTenths",
      "evidence",
    ]) {
      assert.equal(Object.hasOwn(body, hidden), false);
    }
  };

  const queued = await request(
    `/v1/submissions/${receipt.submissionId}`,
    "student",
  );
  assert.equal(queued.status, 200);
  const queuedBody = (await queued.json()) as Record<string, unknown>;
  assert.deepEqual(
    queuedBody,
    expectedStatus({
      status: "queued",
      judgeVerdict: null,
      testVerdicts: [],
    }),
  );
  assertPrivateStatus(queuedBody);

  const claim = repository.claimJob("test-worker", { now, leaseMs: 30_000 });
  assert.ok(claim);
  const running = await request(
    `/v1/submissions/${receipt.submissionId}`,
    "student",
  );
  assert.equal(running.status, 200);
  const runningBody = (await running.json()) as Record<string, unknown>;
  assert.deepEqual(
    runningBody,
    expectedStatus({
      status: "running",
      judgeVerdict: null,
      testVerdicts: [],
    }),
  );
  assertPrivateStatus(runningBody);

  repository.recordJudgeResult(
    claim,
    { judgeStatus: "WA", tests: ["WA"] },
    now,
  );
  const status = await request(
    `/v1/submissions/${receipt.submissionId}`,
    "student",
  );
  assert.equal(status.status, 200);
  const body = (await status.json()) as Record<string, unknown>;
  assert.deepEqual(
    body,
    expectedStatus({
      status: "completed",
      judgeVerdict: "WA",
      testVerdicts: ["WA"],
    }),
  );
  assertPrivateStatus(body);

  const before = databaseSnapshot(repository);
  for (const account of ["admin", "owner", "foreign"] as const) {
    const denied = await request(
      `/v1/submissions/${receipt.submissionId}`,
      account,
    );
    await expectProblem(denied, 403);
    assert.equal(databaseSnapshot(repository), before);
  }

  const foreign = await request(
    `/v1/submissions/${receipt.submissionId}`,
    "otherStudent",
  );
  await expectProblem(foreign, 404);
  assert.equal(databaseSnapshot(repository), before);
});

test("4B: only the owning TA receives persisted review queue evidence", async (t) => {
  const { labId, repository, request } = await fixture(t);
  await prepareCheckedSubmission({
    repository,
    submit: () =>
      repository.submit(
        accounts.student.principal,
        labId,
        { source: "int main() { return 0; }\n" },
        now,
      ),
    now,
    workerId: "test-worker",
    evaluations: [
      {
        constraintId: "C1",
        verdict: "pass",
        source: "hard-rule",
        evidence: [],
      },
    ],
  });

  const owner = await request(`/v1/labs/${labId}/reviews`, "owner");
  assert.equal(owner.status, 200);
  assert.deepEqual(
    await owner.json(),
    repository.getReviewQueue(accounts.owner.principal, labId),
  );

  const before = databaseSnapshot(repository);
  const foreign = await request(`/v1/labs/${labId}/reviews`, "foreign");
  await expectProblem(foreign, 404);
  assert.equal(databaseSnapshot(repository), before);
});

test("4B: owning TA records a review decision with 204 and rejected decisions do not mutate", async (t) => {
  const { labId, repository, request } = await fixture(t);
  await prepareCheckedSubmission({
    repository,
    submit: () =>
      repository.submit(
        accounts.student.principal,
        labId,
        { source: "int main() { return 0; }\n" },
        now,
      ),
    now,
    workerId: "test-worker",
    evaluations: [
      {
        constraintId: "C1",
        verdict: "pass",
        source: "hard-rule",
        evidence: [],
      },
    ],
  });
  const original = repository.getReviewQueue(accounts.owner.principal, labId)
    .items[0]!;
  const path = `/v1/reviews/${original.reviewId}/decision`;
  const input = {
    decision: "pass",
    evidence: [],
    reason: "Reviewed source.",
    expectedVersion: original.reviewVersion,
  };

  const success = await request(path, "owner", { method: "POST", body: input });
  assert.equal(success.status, 204);
  assert.equal(await success.text(), "");
  const updated = repository.getReviewQueue(accounts.owner.principal, labId)
    .items[0]!;
  assert.equal(updated.decision, "pass");
  assert.equal(updated.reviewVersion, original.reviewVersion + 1);
  assert.equal(
    repository.db.prepare("SELECT COUNT(*) AS n FROM review_audit").get()?.n,
    1,
  );

  const before = databaseSnapshot(repository);
  const unauthenticated = await request(path, undefined, {
    method: "POST",
    body: input,
  });
  await expectProblem(unauthenticated, 401, "authentication-required");
  assert.equal(databaseSnapshot(repository), before);

  const wrongRole = await request(path, "student", {
    method: "POST",
    body: input,
  });
  await expectProblem(wrongRole, 403, "forbidden");
  assert.equal(databaseSnapshot(repository), before);

  const stale = await request(path, "owner", { method: "POST", body: input });
  await expectProblem(stale, 409, "workflow-conflict");
  assert.equal(databaseSnapshot(repository), before);

  const foreign = await request(path, "foreign", {
    method: "POST",
    body: { ...input, expectedVersion: updated.reviewVersion },
  });
  await expectProblem(foreign, 404, "not-found");
  assert.equal(databaseSnapshot(repository), before);

  const invalid = await request(path, "owner", {
    method: "POST",
    body: { ...input, expectedVersion: "not-an-integer" },
  });
  await expectProblem(invalid, 400, "validation");
  assert.equal(databaseSnapshot(repository), before);
});
