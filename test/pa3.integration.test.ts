import assert from "node:assert/strict";
import { test } from "node:test";
import {
  httpFixture,
  finishChecking,
} from "./integration/publish-readiness.ts";
import { people } from "./helpers/workflow.ts";

test("integration: direct Publish refuses queued judging with no database mutation", async (t) => {
  const fixture = await httpFixture(t);
  fixture.enqueue();
  const before = fixture.snapshot();
  const response = await fixture.publish();
  assert.equal(response.status, 409);
  assert.match((await response.json()).type, /judging-pending$/);
  assert.equal(fixture.snapshot(), before);
});

test("integration: direct Publish refuses AC before checker initialization, with zero review rows", async (t) => {
  const fixture = await httpFixture(t);
  fixture.enqueue();
  const claim = fixture.repo.claimJob("fixture", {
    now: fixture.now,
    leaseMs: 30_000,
  });
  assert.ok(claim);
  fixture.repo.recordJudgeResult(
    claim,
    { judgeStatus: "AC", tests: ["AC"] },
    fixture.now,
  );
  const before = fixture.snapshot();
  assert.equal(
    fixture.repo.db.prepare("SELECT COUNT(*) AS n FROM review_items").get()?.n,
    0,
  );
  const response = await fixture.publish();
  assert.equal(response.status, 409);
  assert.match((await response.json()).type, /reviews-pending$/);
  assert.equal(fixture.snapshot(), before);
});

test("integration: pending TA decisions refuse Publish after the checker finishes", async (t) => {
  const fixture = await httpFixture(t);
  fixture.enqueue();
  finishChecking(fixture);
  const before = fixture.snapshot();
  const response = await fixture.publish();
  assert.equal(response.status, 409);
  assert.match((await response.json()).type, /reviews-pending$/);
  assert.equal(fixture.snapshot(), before);
});

test("integration: student and foreign TA direct requests cannot publish or learn lab existence", async (t) => {
  const fixture = await httpFixture(t);
  fixture.enqueue();
  const before = fixture.snapshot();
  const student = await fixture.publish("student");
  assert.equal(student.status, 403);
  const foreign = await fixture.publish("foreign");
  const missing = await fixture.publish("ta", 999999);
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(
    { ...(await foreign.json()), instance: "" },
    { ...(await missing.json()), instance: "" },
  );
  assert.equal(fixture.snapshot(), before);
});

test("integration: completed human review permits one persistent HTTP publication", async (t) => {
  const fixture = await httpFixture(t);
  fixture.enqueue();
  finishChecking(fixture);
  for (const item of fixture.repo.getReviewQueue(people.ta, fixture.labId)
    .items) {
    fixture.repo.reviewConstraint(
      people.ta,
      item.reviewId,
      {
        decision: "pass",
        evidence: [],
        reason: "Reviewed source",
        expectedVersion: item.reviewVersion,
      },
      fixture.now,
    );
  }
  const first = await fixture.publish();
  assert.equal(first.status, 200);
  const receipt = await first.text();
  const replay = await fixture.publish();
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("idempotent-replayed"), "true");
  assert.equal(await replay.text(), receipt);
  assert.equal(
    fixture.repo.db.prepare("SELECT COUNT(*) AS n FROM publication_audit").get()
      ?.n,
    1,
  );
  assert.equal(
    fixture.repo.db.prepare("SELECT score_tenths FROM published_marks").get()
      ?.score_tenths,
    100,
  );
});
