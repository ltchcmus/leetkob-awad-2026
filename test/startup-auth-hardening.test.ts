import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { WorkflowRepository } from "../src/db/workflow-repository.ts";

const serverEntry = ["src/server.ts"];
const demoToken = "synthetic-demo-token-with-32-characters";

async function reserveLoopbackPort(): Promise<number> {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function startServer(env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, serverEntry, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function expectStartupFailure(
  env: NodeJS.ProcessEnv,
  expected: RegExp,
): Promise<void> {
  const child = startServer(env);
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const result = await Promise.race([
    once(child, "exit").then(([code]) => ({ code: code as number | null })),
    new Promise<{ timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), 2000),
    ),
  ]);
  if ("timedOut" in result) {
    child.kill();
    await once(child, "exit");
    assert.fail("server listened when startup configuration should fail");
  }
  assert.notEqual(result.code, 0);
  assert.match(stderr, expected);
}

async function startReadyServer(env: NodeJS.ProcessEnv) {
  const child = startServer(env);
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(([code]) => {
      throw new Error(`server exited before listen (${code}): ${stderr}`);
    }),
  ]);
  return child;
}

async function stopServer(
  child: ReturnType<typeof startServer>,
): Promise<void> {
  child.kill();
  await once(child, "exit");
}

test("startup keeps demo authentication for loopback development", async () => {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-startup-demo-"));
  const databasePath = join(directory, "app.db");
  const repository = new WorkflowRepository(databasePath);
  const admin = { id: "demo-admin", role: "admin" } as const;
  const ta = { id: "ta-demo", role: "ta" } as const;
  repository.provisionUser(admin);
  repository.provisionUser(ta);
  const classId = repository.createClass(admin, "Demo class");
  repository.assignTa(admin, classId, ta.id);
  repository.close();
  const port = await reserveLoopbackPort();
  const child = await startReadyServer({
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(port),
    DATABASE_PATH: databasePath,
    DEMO_AUTH_TOKEN: demoToken,
    AUTH_ADAPTER_MODULE: undefined,
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/labs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${demoToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        classId,
        statement: "Return normally.",
        deadline: new Date(Date.now() + 60_000).toISOString(),
        tests: [{ input: "", expectedOutput: "" }],
        constraints: [
          { id: "C1", text: "Return normally.", deductionTenths: 10 },
        ],
      }),
    });
    assert.equal(response.status, 201);
  } finally {
    await stopServer(child);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production and non-loopback startup require a trusted auth adapter", async () => {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-startup-policy-"));
  try {
    await expectStartupFailure(
      {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(await reserveLoopbackPort()),
        DATABASE_PATH: join(directory, "production.db"),
        DEMO_AUTH_TOKEN: demoToken,
        AUTH_ADAPTER_MODULE: undefined,
      },
      /trusted authentication adapter/i,
    );
    await expectStartupFailure(
      {
        NODE_ENV: "development",
        HOST: "0.0.0.0",
        PORT: String(await reserveLoopbackPort()),
        DATABASE_PATH: join(directory, "non-loopback.db"),
        DEMO_AUTH_TOKEN: demoToken,
        AUTH_ADAPTER_MODULE: undefined,
      },
      /trusted authentication adapter/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid trusted adapter configuration fails before the server listens", async () => {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-startup-adapter-"));
  const noExport = join(directory, "no-export.mjs");
  const broken = join(directory, "broken.mjs");
  writeFileSync(noExport, "export const value = 1;\n");
  writeFileSync(broken, 'throw new Error("adapter import exploded");\n');
  const base = {
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(await reserveLoopbackPort()),
    DATABASE_PATH: join(directory, "app.db"),
  };
  try {
    await expectStartupFailure(
      { ...base, AUTH_ADAPTER_MODULE: "relative-adapter.mjs" },
      /absolute path/i,
    );
    await expectStartupFailure(
      { ...base, AUTH_ADAPTER_MODULE: join(directory, "missing.mjs") },
      /cannot find module/i,
    );
    await expectStartupFailure(
      { ...base, AUTH_ADAPTER_MODULE: broken },
      /adapter import exploded/i,
    );
    await expectStartupFailure(
      { ...base, AUTH_ADAPTER_MODULE: noExport },
      /invalid trusted authentication adapter/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a trusted adapter has no demo fallback and preserves role and ownership checks", async () => {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-startup-trusted-"));
  const databasePath = join(directory, "app.db");
  const adapterPath = join(directory, "adapter.mjs");
  writeFileSync(
    adapterPath,
    `export function authenticate(request) {
      const identities = {
        "Bearer adapter-owner": { id: "adapter-owner", role: "ta" },
        "Bearer adapter-foreign": { id: "adapter-foreign", role: "ta" },
        "Bearer adapter-student": { id: "adapter-student", role: "student" },
      };
      return identities[request.headers.authorization] ?? undefined;
    }
`,
  );
  const repository = new WorkflowRepository(databasePath);
  const admin = { id: "adapter-admin", role: "admin" } as const;
  const owner = { id: "adapter-owner", role: "ta" } as const;
  const foreign = { id: "adapter-foreign", role: "ta" } as const;
  const student = { id: "adapter-student", role: "student" } as const;
  for (const principal of [admin, owner, foreign, student]) {
    repository.provisionUser(principal);
  }
  const classA = repository.createClass(admin, "Adapter class A");
  const classB = repository.createClass(admin, "Adapter class B");
  repository.assignTa(admin, classA, owner.id);
  repository.assignTa(admin, classB, foreign.id);
  repository.enrollStudent(owner, classA, student.id);
  repository.close();
  const port = await reserveLoopbackPort();
  const child = await startReadyServer({
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    DATABASE_PATH: databasePath,
    AUTH_ADAPTER_MODULE: adapterPath,
    DEMO_AUTH_TOKEN: demoToken,
  });
  try {
    const create = await fetch(`http://127.0.0.1:${port}/v1/labs`, {
      method: "POST",
      headers: {
        Authorization: "Bearer adapter-owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        classId: classA,
        statement: "Return normally.",
        deadline: new Date(Date.now() + 60_000).toISOString(),
        tests: [{ input: "", expectedOutput: "" }],
        constraints: [
          { id: "C1", text: "Return normally.", deductionTenths: 10 },
        ],
      }),
    });
    assert.equal(create.status, 201);
    const { labId } = (await create.json()) as { labId: number };
    for (const authorization of [
      undefined,
      "Bearer invalid",
      `Bearer ${demoToken}`,
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${port}/v1/labs/${labId}`,
        {
          headers:
            authorization === undefined ? {} : { Authorization: authorization },
        },
      );
      assert.equal(response.status, 401);
    }
    const studentResponse = await fetch(
      `http://127.0.0.1:${port}/v1/labs/${labId}`,
      {
        headers: { Authorization: "Bearer adapter-student" },
      },
    );
    assert.equal(studentResponse.status, 403);
    const foreignResponse = await fetch(
      `http://127.0.0.1:${port}/v1/labs/${labId}`,
      {
        headers: { Authorization: "Bearer adapter-foreign" },
      },
    );
    assert.equal(foreignResponse.status, 404);
  } finally {
    await stopServer(child);
    rmSync(directory, { recursive: true, force: true });
  }
});
