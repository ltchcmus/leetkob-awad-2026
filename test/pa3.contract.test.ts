import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { createApp } from "../src/app.ts";
import { PublicationRepository } from "../src/repository.ts";
import type { Principal } from "../src/repository.ts";

const now = "2026-11-05T08:00:00.000Z";
const identities: Record<string, Principal> = {
  own: { id: "ta-own", role: "ta" },
  foreign: { id: "ta-foreign", role: "ta" },
  student: { id: "student-1", role: "student" },
};

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-pa3-contract-"));
  const path = join(directory, "app.db");
  const repository = new PublicationRepository(path);
  repository.db.exec(`
    INSERT INTO labs VALUES (1, 10, '${now}');
    INSERT INTO ta_classes VALUES ('ta-own', 10), ('ta-foreign', 20);
    INSERT INTO counted_submissions VALUES (11, 1, 'student-1', 'AC', 70);
    INSERT INTO review_items VALUES (11, 'C1', 'pass');
  `);
  const server = createApp({
    repository,
    authenticate: (request) => {
      const value = request.headers.authorization;
      return value?.startsWith("Bearer ")
        ? identities[value.slice(7)]
        : undefined;
    },
    clock: () => new Date(now),
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
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    repository,
    request: (
      path: string,
      token: keyof typeof identities,
      options: { method?: string; body?: string } = {},
    ) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(options.body === undefined ? {} : { body: options.body }),
      }),
  };
}

function databaseSnapshot(repository: PublicationRepository): string {
  const tables = repository.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  return JSON.stringify(
    tables.map(({ name }) => [
      name,
      repository.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  );
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

test("G1 proposed: owning TA can read a lab while a foreign TA receives non-disclosing 404", async (t) => {
  const { repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const owner = await request("/v1/labs/1", "own");
  assert.equal(owner.status, 200);
  assert.deepEqual(await owner.json(), {
    labId: 1,
    classId: 10,
    statement: "example statement",
  });
  const foreign = await request("/v1/labs/1", "foreign");
  await expectProblem(foreign, 404, "not-found");
  assert.equal(databaseSnapshot(repository), before);
});

test("G1 proposed: student cannot publish and a denied request does not mutate PA2 records", async (t) => {
  const { repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const response = await request("/v1/labs/1/publish", "student", {
    method: "POST",
    body: "{}",
  });
  await expectProblem(response, 403, "forbidden");
  assert.equal(databaseSnapshot(repository), before);
});

test("G1 proposed: enrolled student creates a queued submission without receiving a verdict", async (t) => {
  const { request } = await fixture(t);
  const response = await request("/v1/labs/1/submissions", "student", {
    method: "POST",
    body: JSON.stringify({ source: "int main() {}" }),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    submissionId: "submission-1",
    status: "queued",
    createdAt: now,
  });
});

test("G1 proposed: student status hides constraint verdict and deduction before Publish", async (t) => {
  const { request } = await fixture(t);
  const response = await request("/v1/submissions/submission-1", "student");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    submissionId: "submission-1",
    judgeStatus: "judged",
  });
});

test("G1 proposed: owning TA can read its review queue", async (t) => {
  const { request } = await fixture(t);
  const response = await request("/v1/labs/1/reviews", "own");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [
      {
        reviewId: "review-1",
        submissionId: "submission-1",
        constraints: [
          {
            constraintId: "C1",
            verdict: "pass",
            evidence: [],
          },
        ],
      },
    ],
  });
});
test("G1 proposed: a foreign TA cannot read a review queue and leaves the database unchanged", async (t) => {
  const { repository, request } = await fixture(t);
  const before = databaseSnapshot(repository);
  const response = await request("/v1/labs/1/reviews", "foreign");
  await expectProblem(response, 404, "not-found");
  assert.equal(databaseSnapshot(repository), before);
});
