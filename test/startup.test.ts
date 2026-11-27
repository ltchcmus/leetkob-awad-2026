import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { WorkflowRepository } from "../src/db/workflow-repository.ts";

test(
  "real server entrypoint creates a lab and preserves its database on restart",
  { timeout: 15000 },
  async () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "leetkob-startup-")),
      "app.db",
    );
    const repo = new WorkflowRepository(path);
    const admin = { id: "startup-admin", role: "admin" } as const;
    const ta = { id: "ta-demo", role: "ta" } as const;
    repo.provisionUser(admin);
    repo.provisionUser(ta);
    const classId = repo.createClass(admin, "Synthetic startup");
    repo.assignTa(admin, classId, ta.id);
    repo.close();
    const token = "synthetic-startup-token-with-32-characters";
    for (let attempt = 0; attempt < 2; attempt++) {
      const child = spawn(process.execPath, ["src/server.ts"], {
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: "31879",
          DATABASE_PATH: path,
          DEMO_AUTH_TOKEN: token,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      try {
        await once(child.stdout, "data");
        const response = await fetch("http://127.0.0.1:31879/v1/labs", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            classId,
            statement: "Return normally.",
            deadline: new Date(Date.now() + 60000).toISOString(),
            tests: [{ input: "", expectedOutput: "" }],
            constraints: [
              { id: "C1", text: "Return normally.", deductionTenths: 10 },
            ],
          }),
        });
        assert.equal(response.status, 201);
      } finally {
        child.kill();
        await once(child, "exit");
      }
    }
    const check = new WorkflowRepository(path);
    assert.equal(
      check.db.prepare("SELECT COUNT(*) n FROM lab_details").get()?.n,
      2,
    );
    check.close();
  },
);
