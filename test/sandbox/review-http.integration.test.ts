import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createApp } from "../../src/app.ts";
import { syntheticAuthenticator } from "../../src/auth.ts";
import { people, workflowFixture } from "../helpers/workflow.ts";

test(
  "five HTTP actors submit three real sandbox cases and preserve TA-only review and Publish gates",
  { timeout: 90000 },
  async (t) => {
    assert.equal(process.env.SANDBOX_RUN_ATTACKS, "1");
    const { repo, path, now, labId: seedLab } = workflowFixture(t);
    let clock = now;
    const accounts = Object.entries(people).map(([name, principal]) => ({
      name,
      principal,
      token: randomUUID() + randomUUID(),
    }));
    const server = createApp({
      repository: repo,
      authenticate: syntheticAuthenticator(accounts),
      clock: () => new Date(clock),
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const request = (route: string, actor: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${address.port}${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${accounts.find((a) => a.name === actor)!.token}`,
          "Content-Type": "application/json",
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    const classId = repo.db
      .prepare("SELECT class_id FROM labs WHERE id=?")
      .get(seedLab)!.class_id;
    const root = "test/eval-cases/own";
    const tests = ["01", "02", "03", "04"].map((id) => ({
      input: readFileSync(`${root}/problems/own-sort/tests/${id}.in`, "utf8"),
      expectedOutput: readFileSync(
        `${root}/problems/own-sort/tests/${id}.out`,
        "utf8",
      ),
    }));
    const declared = JSON.parse(
      readFileSync(`${root}/problems/own-sort/constraints.json`, "utf8"),
    ) as { id: string; text: string; deduction: number }[];
    const created = await request("/v1/labs", "ta", {
      classId,
      statement: readFileSync(`${root}/problems/own-sort/statement.md`, "utf8"),
      deadline: new Date(now + 60000).toISOString(),
      tests,
      constraints: declared.map((c) => ({
        id: c.id,
        text: c.text,
        deductionTenths: c.deduction * 10,
      })),
    });
    assert.equal(created.status, 201);
    const { labId } = (await created.json()) as { labId: number };
    assert.equal(
      (await request(`/v1/labs/${labId}/reviews`, "foreign")).status,
      404,
    );
    assert.equal(
      (await request(`/v1/labs/${labId}/reviews`, "student")).status,
      403,
    );
    assert.equal(
      (await request(`/v1/labs/${labId}/publish`, "admin", {})).status,
      403,
    );
    const run = promisify(execFile);
    for (const [name, actor] of [
      ["s01", "student"],
      ["s04", "other"],
      ["s03", "student"],
    ] as const) {
      const admitted = await request(`/v1/labs/${labId}/submissions`, actor, {
        source: readFileSync(`${root}/solutions/own-sort/${name}.cpp`, "utf8"),
      });
      assert.equal(admitted.status, 202);
      const receipt = (await admitted.json()) as { submissionId: string };
      assert.equal(
        repo.getSubmissionForStudent(people[actor], receipt.submissionId)
          .status,
        "queued",
      );
      const { stdout } = await run(process.execPath, ["src/worker/main.ts"], {
        env: {
          ...process.env,
          DATABASE_PATH: path,
          MODEL_OFF: "1",
          WORKER_ONCE: "1",
          WORKER_ADAPTER_MODULE: fileURLToPath(
            new URL("../../src/worker/execution-adapters.ts", import.meta.url),
          ),
        },
        timeout: 25000,
      });
      assert.match(stdout, /job.completed/);
      const status = await request(
        `/v1/submissions/${receipt.submissionId}`,
        actor,
      );
      assert.equal(status.status, 200);
      const visible = (await status.json()) as Record<string, unknown>;
      assert.equal(visible.judgeVerdict, "AC");
      for (const hidden of ["evidence", "deduction", "constraintVerdicts"])
        assert.equal(Object.hasOwn(visible, hidden), false);
      assert.equal(
        (
          await request(
            `/v1/submissions/${receipt.submissionId}`,
            actor === "student" ? "other" : "student",
          )
        ).status,
        404,
      );
      const queue = await request(`/v1/labs/${labId}/reviews`, "ta");
      assert.equal(queue.status, 200);
      const items = (await queue.json()).items as {
        submissionId: string;
        deductionTenths: number;
      }[];
      assert.equal(
        items.filter((item) => item.submissionId === receipt.submissionId)
          .length,
        2,
      );
    }
    clock = now + 60000;
    const pending = await request(`/v1/labs/${labId}/publish`, "ta", {});
    assert.equal(pending.status, 409);
    assert.equal(
      (await request(`/v1/labs/${labId}/publish`, "student", {})).status,
      403,
    );
    assert.equal(
      (await request(`/v1/labs/${labId}/publish`, "foreign", {})).status,
      404,
    );
    const reviews = repo.getReviewQueue(people.ta, labId).items;
    assert.equal(reviews.length, 4); // Latest eligible submission per each of two students.
    for (const item of reviews) {
      const original = String(
        repo.db
          .prepare("SELECT source FROM submissions WHERE id=?")
          .get(item.submissionId)?.source,
      );
      const violating =
        item.verdict === "violation" || item.constraintId === "C2";
      const lines = original.split(/\r?\n/);
      const evidenceLine = lines.findIndex(
        (line) =>
          line.includes("std::sort(a.begin") ||
          line.includes("for (std::size_t end"),
      );
      assert.ok(evidenceLine >= 0);
      const response = await request(
        `/v1/reviews/${item.reviewId}/decision`,
        "ta",
        {
          decision: violating ? "violation" : "pass",
          evidence: violating
            ? [{ line: evidenceLine + 1, text: lines[evidenceLine] }]
            : [],
          reason: "Synthetic TA confirmed the original algorithm evidence",
          deductionTenths: 99, // Ignored; the lab's declared deduction remains authoritative.
          expectedVersion: item.reviewVersion,
        },
      );
      assert.equal(response.status, 204);
    }
    const published = await request(`/v1/labs/${labId}/publish`, "ta", {});
    assert.equal(published.status, 200);
    const receipt = await published.text();
    const replay = await request(`/v1/labs/${labId}/publish`, "ta", {});
    assert.equal(await replay.text(), receipt);
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) n FROM verdict_sets").get()?.n,
      3,
    );
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) n FROM review_audit").get()?.n,
      4,
    );
    assert.deepEqual(
      repo.db
        .prepare(
          "SELECT score_tenths FROM published_marks WHERE lab_id=? ORDER BY score_tenths",
        )
        .all(labId)
        .map((row) => row.score_tenths),
      [30, 60],
    );
  },
);
