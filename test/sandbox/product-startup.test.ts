import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { WorkflowRepository } from "../../src/db/workflow-repository.ts";
const exec = promisify(execFile);
test(
  "real API and Docker worker entrypoints persist six judge outcomes",
  { timeout: 120000 },
  async () => {
    assert.equal(process.env.SANDBOX_RUN_ATTACKS, "1");
    const path = join(
      mkdtempSync(join(tmpdir(), "leetkob-product-")),
      "app.db",
    );
    const repo = new WorkflowRepository(path);
    const admin = { id: "admin-product", role: "admin" } as const;
    const ta = { id: "ta-product", role: "ta" } as const;
    const student = { id: "student-product", role: "student" } as const;
    for (const person of [admin, ta, student]) repo.provisionUser(person);
    const classId = repo.createClass(admin, "Synthetic product");
    repo.assignTa(admin, classId, ta.id);
    repo.enrollStudent(ta, classId, student.id);
    const env = {
      ...process.env,
      DATABASE_PATH: path,
      MODEL_OFF: "1",
      PORT: "31880",
      HOST: "127.0.0.1",
      AUTH_ADAPTER_MODULE: resolve("test/fixtures/startup-auth.ts"),
    };
    const server = spawn(process.execPath, ["src/server.ts"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await once(server.stdout, "data");
      const request = (url: string, token: string, body?: unknown) =>
        fetch("http://127.0.0.1:31880" + url, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      const lab = await request("/v1/labs", "public-synthetic-ta", {
        classId,
        statement: "Return normally",
        deadline: new Date(Date.now() + 120000).toISOString(),
        tests: [{ input: "", expectedOutput: "" }],
        constraints: [
          { id: "C1", text: "Return normally.", deductionTenths: 10 },
        ],
      });
      assert.equal(lab.status, 201);
      const { labId } = (await lab.json()) as { labId: number };
      const cases = [
        ["AC", "int main(){return 0;}"],
        [
          "AC",
          "#include <cstdlib>\nint main(){auto p=(volatile char*)malloc(134217728);if(!p)return 1;for(int i=0;i<134217728;i+=4096)p[i]=1;}",
        ],
        [
          "RE",
          "#include <cstdio>\nint main(){for(int i=0;i<1100000;i++)putchar(120);}",
        ],
        ["WA", ["#include <cstdio>", 'int main(){puts("wrong");}'].join("\n")],
        ["CE", "not valid C++"],
        ["TLE", "int main(){for(;;){}}"],
        ["RE", "int main(){__builtin_trap();}"],
        [
          "MLE",
          [
            "#include <cstdlib>",
            "int main(){for(;;){auto p=(volatile char*)malloc(1048576);if(!p)return 1;for(int i=0;i<1048576;i+=4096)p[i]=1;}}",
          ].join("\n"),
        ],
      ];
      for (const [expected, source] of cases) {
        const admitted = await request(
          "/v1/labs/" + labId + "/submissions",
          "public-synthetic-student",
          { source },
        );
        assert.equal(admitted.status, 202);
        const { submissionId } = (await admitted.json()) as {
          submissionId: string;
        };
        await exec(process.execPath, ["src/worker/main.ts"], {
          env: {
            ...env,
            WORKER_ONCE: "1",
            WORKER_ADAPTER_MODULE: resolve("src/worker/execution-adapters.ts"),
          },
          timeout: 25000,
        });
        const result = await request(
          "/v1/submissions/" + submissionId,
          "public-synthetic-student",
        );
        assert.equal(
          ((await result.json()) as { judgeVerdict: string }).judgeVerdict,
          expected,
        );
        console.log("PRODUCT_JUDGE=" + expected);
      }
      assert.equal(
        repo.db.prepare("SELECT COUNT(*) n FROM verdict_sets").get()?.n,
        1,
      );
    } finally {
      server.kill();
      await once(server, "exit");
      repo.close();
    }
  },
);
