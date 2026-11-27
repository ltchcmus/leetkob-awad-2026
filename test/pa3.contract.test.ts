import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { createApp } from "../src/app.ts";
import { WorkflowRepository } from "../src/db/workflow-repository.ts";
import type { Principal } from "../src/repository.ts";
import {
  databaseSnapshot,
  prepareCheckedSubmission,
  startTestServer,
} from "./helpers/workflow.ts";

const now = Date.parse("2026-11-05T08:00:00.000Z");
const identities = {
  admin: { id: "admin-g1", role: "admin" },
  own: { id: "ta-own", role: "ta" },
  foreign: { id: "ta-foreign", role: "ta" },
  student: { id: "student-1", role: "student" },
} satisfies Record<string, Principal>;

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-pa3-contract-"));
  const repository = new WorkflowRepository(join(directory, "app.db"));
  for (const identity of Object.values(identities)) {
    repository.provisionUser(identity);
  }
  const classId = repository.createClass(identities.admin, "Class A");
  const foreignClassId = repository.createClass(identities.admin, "Class B");
  repository.assignTa(identities.admin, classId, identities.own.id);
  repository.assignTa(identities.admin, foreignClassId, identities.foreign.id);
  repository.enrollStudent(identities.own, classId, identities.student.id);
  const labId = repository.createLab(identities.own, {
    classId,
    statement: "example statement",
    deadline: new Date(now + 60_000).toISOString(),
    tests: [{ input: "", expectedOutput: "" }],
    constraints: [
      { id: "C1", text: "Do not use `goto`.", deductionTenths: 20 },
    ],
  });
  const server = createApp({
    repository,
    authenticate: (request) => {
      const value = request.headers.authorization;
      return value?.startsWith("Bearer ")
        ? identities[value.slice("Bearer ".length) as keyof typeof identities]
        : undefined;
    },
    clock: () => new Date(now),
  });
  const port = await startTestServer(t, server, repository, directory);
  return {
    classId,
    labId,
    repository,
    request: (
      path: string,
      token: keyof typeof identities | undefined,
      options: { method?: string; body?: object } = {},
    ) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
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

async function expectProblem(response: Response, status: number, slug: string) {
  assert.equal(response.status, status);
  assert.equal(
    response.headers.get("content-type"),
    "application/problem+json",
  );
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.type, `https://leetkob.example/problems/${slug}`);
}

async function submit(
  request: (
    path: string,
    token: keyof typeof identities | undefined,
    options?: { method?: string; body?: object },
  ) => Promise<Response>,
  labId: number,
) {
  const response = await request(`/v1/labs/${labId}/submissions`, "student", {
    method: "POST",
    body: { source: "int main() { return 0; }\n" },
  });
  assert.equal(response.status, 202);
  return (await response.json()) as {
    submissionId: string;
    status: string;
    createdAt: string;
  };
}

test("G1 proposed: owning TA can read a lab while a foreign TA receives non-disclosing 404", async (t) => {
  const { classId, labId, repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const owner = await request(`/v1/labs/${labId}`, "own");
  assert.equal(owner.status, 200);
  assert.deepEqual(await owner.json(), {
    labId,
    classId,
    statement: "example statement",
  });
  const foreign = await request(`/v1/labs/${labId}`, "foreign");
  await expectProblem(foreign, 404, "not-found");
  assert.equal(databaseSnapshot(repository), before);
});

test("G1 proposed: GET lab authenticates and authorizes before exposing its statement", async (t) => {
  const { labId, repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  await expectProblem(
    await request(`/v1/labs/${labId}`, undefined),
    401,
    "authentication-required",
  );
  for (const identity of ["student", "admin"] as const) {
    await expectProblem(
      await request(`/v1/labs/${labId}`, identity),
      403,
      "forbidden",
    );
  }
  assert.equal(databaseSnapshot(repository), before);
});

test("G1 proposed: student cannot publish and a denied request does not mutate PA2 records", async (t) => {
  const { labId, repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const response = await request(`/v1/labs/${labId}/publish`, "student", {
    method: "POST",
    body: {},
  });
  await expectProblem(response, 403, "forbidden");
  assert.equal(databaseSnapshot(repository), before);
});

test("G1 proposed: enrolled student creates a queued submission without receiving a verdict", async (t) => {
  const { labId, request } = await fixture(t);
  const receipt = await submit(request, labId);
  assert.match(receipt.submissionId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(
    { ...receipt, submissionId: "" },
    {
      submissionId: "",
      status: "queued",
      createdAt: new Date(now).toISOString(),
    },
  );
  assert.equal(Object.hasOwn(receipt, "judgeVerdict"), false);
});

test("G4: a 65,536-byte UTF-8 source is accepted even though its JSON body is larger", async (t) => {
  const { labId, request } = await fixture(t);
  const source = "x".repeat(65_536);
  assert.ok(Buffer.byteLength(JSON.stringify({ source }), "utf8") > 65_536);
  const response = await request(`/v1/labs/${labId}/submissions`, "student", {
    method: "POST",
    body: { source },
  });
  assert.equal(response.status, 202);
});

test("G4: source above 65,536 UTF-8 bytes reaches G2 validation instead of the HTTP transport limit", async (t) => {
  const { labId, repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const response = await request(`/v1/labs/${labId}/submissions`, "student", {
    method: "POST",
    body: { source: "x".repeat(65_537) },
  });
  await expectProblem(response, 400, "validation");
  assert.equal(databaseSnapshot(repository), before);
});

test("G4: submission transport limit is 512 KiB and reports its own 413 detail", async (t) => {
  const { labId, repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const response = await request(`/v1/labs/${labId}/submissions`, "student", {
    method: "POST",
    body: { source: "ok", padding: "x".repeat(524_288) },
  });
  const problem = response.clone();
  await expectProblem(response, 413, "payload-too-large");
  assert.equal(
    ((await problem.json()) as { detail: string }).detail,
    "The request body exceeds 524288 bytes.",
  );
  assert.equal(databaseSnapshot(repository), before);
});

test("G4: mutation routes reject a wrong role before validating the request body", async (t) => {
  const { labId, repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const attempts = [
    request("/v1/labs", "student", { method: "POST", body: {} }),
    request(`/v1/labs/${labId}/submissions`, "own", {
      method: "POST",
      body: {},
    }),
    request(
      "/v1/reviews/00000000-0000-0000-0000-000000000000/decision",
      "admin",
      {
        method: "POST",
        body: {},
      },
    ),
  ];
  for (const attempt of attempts) {
    await expectProblem(await attempt, 403, "forbidden");
  }
  assert.equal(databaseSnapshot(repository), before);
});

test("G1: student status exposes lifecycle and judge test verdicts without review data", async (t) => {
  const { labId, repository, request } = await fixture(t);
  const receipt = await submit(request, labId);
  const claim = repository.claimJob("g1-test-worker", {
    now,
    leaseMs: 30_000,
  });
  assert.ok(claim);
  repository.recordJudgeResult(
    claim,
    { judgeStatus: "AC", tests: ["AC"] },
    now,
  );
  const response = await request(
    `/v1/submissions/${receipt.submissionId}`,
    "student",
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(body, {
    submissionId: receipt.submissionId,
    status: "running",
    judgeVerdict: "AC",
    testVerdicts: ["AC"],
    createdAt: new Date(now).toISOString(),
  });
  for (const hiddenField of [
    "constraintVerdicts",
    "deduction",
    "deductionTenths",
    "evidence",
  ]) {
    assert.equal(Object.hasOwn(body, hiddenField), false);
  }
});

test("G1 proposed: owning TA can read its persisted flat review queue", async (t) => {
  const { labId, repository, request } = await fixture(t);
  await prepareCheckedSubmission({
    repository,
    submit: () => submit(request, labId),
    now,
    workerId: "g1-test-worker",
    evaluations: [
      {
        constraintId: "C1",
        verdict: "pass",
        source: "hard-rule",
        evidence: [],
      },
    ],
  });
  const response = await request(`/v1/labs/${labId}/reviews`, "own");
  assert.equal(response.status, 200);
  assert.deepEqual(
    await response.json(),
    repository.getReviewQueue(identities.own, labId),
  );
});

test("G1 proposed: a foreign TA cannot read a persisted review queue and leaves the database unchanged", async (t) => {
  const { labId, repository, request } = await fixture(t);
  await prepareCheckedSubmission({
    repository,
    submit: () => submit(request, labId),
    now,
    workerId: "g1-test-worker",
    evaluations: [
      {
        constraintId: "C1",
        verdict: "pass",
        source: "hard-rule",
        evidence: [],
      },
    ],
  });
  const owner = await request(`/v1/labs/${labId}/reviews`, "own");
  assert.equal(owner.status, 200);
  const before = databaseSnapshot(repository);
  const response = await request(`/v1/labs/${labId}/reviews`, "foreign");
  await expectProblem(response, 404, "not-found");
  assert.equal(databaseSnapshot(repository), before);
});
