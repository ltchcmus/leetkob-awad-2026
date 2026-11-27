import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { createApp } from "../../src/app.ts";
import { people, workflowFixture } from "../helpers/workflow.ts";

const run = promisify(execFile);

test(
  "stopped worker leaves a durable job; a new process judges through Docker exactly once",
  { timeout: 40_000 },
  async (t) => {
    assert.equal(process.env.SANDBOX_RUN_ATTACKS, "1");
    assert.ok(process.env.SANDBOX_JUDGE_IMAGE);
    const { repo, path, now, labId } = workflowFixture(t);
    const env = {
      ...process.env,
      DATABASE_PATH: path,
      MODEL_OFF: "1",
      WORKER_ONCE: "1",
      WORKER_ADAPTER_MODULE: fileURLToPath(
        new URL("../../src/worker/execution-adapters.ts", import.meta.url),
      ),
    };
    const worker = () =>
      run(process.execPath, ["src/worker/main.ts"], {
        env,
        timeout: 20_000,
      });
    assert.doesNotMatch((await worker()).stdout, /job.claimed/u);
    const server = createApp({
      repository: repo,
      authenticate: () => people.student,
      clock: () => new Date(now),
    });
    server.listen(0, "127.0.0.1");
    t.after(() => {
      server.closeAllConnections();
      return new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    });
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const admitted = await fetch(
      `http://127.0.0.1:${address.port}/v1/labs/${labId}/submissions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "int main() { return 0; }\n" }),
      },
    );
    assert.equal(admitted.status, 202);
    const receipt = (await admitted.json()) as { submissionId: string };
    assert.equal(
      repo.getSubmissionForStudent(people.student, receipt.submissionId).status,
      "queued",
    );
    assert.match((await worker()).stdout, /job.completed/u);
    assert.doesNotMatch((await worker()).stdout, /job.claimed/u);
    const result = repo.getSubmissionForStudent(
      people.student,
      receipt.submissionId,
    );
    assert.equal(result.judgeVerdict, "AC");
    assert.deepEqual(result.testVerdicts, ["AC"]);
    assert.deepEqual(
      repo
        .getReviewQueue(people.ta, labId)
        .items.map(({ constraintId, verdict }) => [constraintId, verdict]),
      [
        ["C1", "pass"],
        ["C2", "unsure"],
      ],
    );
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
      1,
    );
  },
);
