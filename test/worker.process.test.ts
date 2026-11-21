import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { people, workflowFixture } from "./helpers/workflow.ts";

function startWorker(
  t: TestContext,
  path: string,
  extra: Record<string, string> = {},
) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../src/worker/main.ts", import.meta.url))],
    {
      env: {
        ...process.env,
        DATABASE_PATH: path,
        WORKER_ADAPTER_MODULE: fileURLToPath(
          new URL("./fixtures/worker-adapters.ts", import.meta.url),
        ),
        WORKER_POLL_MS: "20",
        WORKER_LEASE_MS: "500",
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, "exit");
    }
  });
  return { child, output: () => output };
}

async function waitFor(
  child: ChildProcess,
  output: () => string,
  event: string,
) {
  const until = Date.now() + 5000;
  while (
    !output().includes(event) &&
    Date.now() < until &&
    child.exitCode === null
  )
    await delay(20);
  assert.ok(output().includes(event), output());
}

async function exit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null)
    return child.exitCode;
  const result = await once(child, "exit");
  return result[0] as number | null;
}

test(
  "separate worker stopped then restarted processes a durable submission exactly once",
  { timeout: 15000 },
  async (t) => {
    const { repo, path, enqueue, labId } = workflowFixture(t);
    const stopped = startWorker(t, path);
    await waitFor(stopped.child, stopped.output, "worker.ready");
    stopped.child.kill();
    await exit(stopped.child);
    const receipt = enqueue();
    assert.equal(
      repo.getSubmissionForStudent(people.student, receipt.submissionId).status,
      "queued",
    );
    const restarted = startWorker(t, path, { WORKER_ONCE: "1" });
    assert.equal(await exit(restarted.child), 0, restarted.output());
    assert.equal(
      repo.getSubmissionForStudent(people.student, receipt.submissionId)
        .judgeVerdict,
      "AC",
    );
    assert.equal(repo.getReviewQueue(people.ta, labId).items.length, 2);
    const again = startWorker(t, path, { WORKER_ONCE: "1" });
    assert.equal(await exit(again.child), 0, again.output());
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
      1,
    );
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) AS n FROM attempts").get()?.n,
      1,
    );
  },
);

test(
  "crashing a leased worker recovers after restart without duplicate persisted verdicts",
  { timeout: 15000 },
  async (t) => {
    const { repo, path, enqueue } = workflowFixture(t);
    enqueue();
    const crashed = startWorker(t, path, { TEST_BLOCK_SANDBOX: "1" });
    await waitFor(crashed.child, crashed.output, "job.claimed");
    // SIGTERM runs the graceful retry handler on Unix; SIGKILL models a crash.
    assert.equal(crashed.child.kill("SIGKILL"), true);
    await exit(crashed.child);
    assert.equal(
      repo.db.prepare("SELECT outcome FROM attempts").get()?.outcome,
      "active",
    );
    const interrupted = repo.db
      .prepare("SELECT state, lease_expires_at FROM jobs")
      .get();
    assert.equal(interrupted?.state, "leased");
    assert.equal(typeof interrupted?.lease_expires_at, "number");
    await delay(
      Math.max(0, Number(interrupted?.lease_expires_at) - Date.now()) + 20,
    );
    const recovered = startWorker(t, path, { WORKER_ONCE: "1" });
    assert.equal(await exit(recovered.child), 0, recovered.output());
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) AS n FROM attempts").get()?.n,
      2,
    );
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) AS n FROM verdict_sets").get()?.n,
      1,
    );
    assert.deepEqual(
      repo.db
        .prepare("SELECT outcome FROM attempts ORDER BY number")
        .all()
        .map((row) => row.outcome),
      ["lease_expired", "completed"],
    );
  },
);
