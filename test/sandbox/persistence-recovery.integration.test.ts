import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { people, workflowFixture } from "../helpers/workflow.ts";
import { connectDocker } from "../../src/sandbox/docker.ts";
import { reconcileSandboxAttempt } from "../../src/worker/reconcile.ts";

test(
  "real worker crash quarantines its container until attempt-UUID reconciliation",
  { timeout: 60000 },
  async (t) => {
    assert.equal(process.env.SANDBOX_RUN_ATTACKS, "1");
    const { repo, path, labId, now } = workflowFixture(t);
    repo.submit(
      people.student,
      labId,
      {
        source:
          "#include <iostream>\n#include <unistd.h>\nint main(){usleep(1000000);return 0;}\n",
      },
      now,
    );
    const env = {
      ...process.env,
      DATABASE_PATH: path,
      MODEL_OFF: "1",
      WORKER_ONCE: "1",
      WORKER_LEASE_MS: "1000",
      WORKER_ADAPTER_MODULE: fileURLToPath(
        new URL("../../src/worker/execution-adapters.ts", import.meta.url),
      ),
    };
    const launch = () =>
      spawn(process.execPath, ["src/worker/main.ts"], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    const child = launch();
    let output = "";
    child.stdout.on("data", (c) => {
      output += String(c);
    });
    child.stderr.on("data", (c) => {
      output += String(c);
    });
    const engine = await connectDocker();
    let attemptId = "";
    let containerId = "";
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !containerId) {
      attemptId = String(
        repo.db
          .prepare("SELECT id FROM attempts ORDER BY number DESC LIMIT 1")
          .get()?.id ?? "",
      );
      if (attemptId) {
        const filters = encodeURIComponent(
          JSON.stringify({ label: [`leetkob.sandbox.run=${attemptId}`] }),
        );
        const rows = await engine.call<{ Id: string }[]>(
          "GET",
          `/containers/json?filters=${filters}`,
        );
        containerId = rows[0]?.Id ?? "";
      }
      if (!containerId) await delay(20);
    }
    assert.ok(containerId, output);
    await engine.call("POST", `/containers/${containerId}/pause`);
    child.kill("SIGKILL");
    await once(child, "exit");
    const expiry = Number(
      repo.db.prepare("SELECT lease_expires_at FROM jobs").get()
        ?.lease_expires_at,
    );
    await delay(Math.max(0, expiry - Date.now()) + 30);
    assert.equal(
      repo.claimJob("replacement", { now: Date.now(), leaseMs: 1000 }),
      null,
    );
    assert.equal(repo.listQuarantinedAttempts()[0]?.attemptId, attemptId);
    assert.equal(
      await reconcileSandboxAttempt(
        repo,
        attemptId,
        "integration-test",
        engine,
      ),
      true,
    );
    const restarted = launch();
    let retryLog = "";
    restarted.stdout.on("data", (c) => {
      retryLog += String(c);
    });
    restarted.stderr.on("data", (c) => {
      retryLog += String(c);
    });
    const [code] = await once(restarted, "exit");
    assert.equal(code, 0, retryLog);
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) n FROM verdict_sets").get()?.n,
      1,
    );
    assert.equal(
      repo.db.prepare("SELECT COUNT(*) n FROM attempts").get()?.n,
      2,
    );
  },
);
