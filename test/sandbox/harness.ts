import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { win32 } from "node:path";
import { promisify } from "node:util";
import type {
  SandboxPolicy,
  SandboxRequest,
  SandboxResult,
} from "../../src/sandbox/contract.ts";

const exec = promisify(execFile);
export const runnerUrl = new URL(
  "../../src/sandbox/runner.ts",
  import.meta.url,
);
export const outerTimeoutMs = 30_000;
export const fakeCanary = "LEETKOB_PUBLIC_TEST_CANARY_NOT_A_SECRET";

export function policyFor(image: string): SandboxPolicy {
  assert.match(
    image,
    /^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/,
    "trusted judge image must be pinned by digest",
  );
  return {
    version: "sandbox-proposal-v1",
    image,
    compilerProfile: "cpp17-o2",
    cpuQuota: 1,
    compile: {
      cpuTimeMs: 5000,
      wallTimeMs: 10_000,
      memoryBytes: 512 * 1024 * 1024,
      pids: 32,
      outputBytes: 8192,
    },
    run: {
      cpuTimeMs: 1000,
      wallTimeMs: 5000,
      memoryBytes: 64 * 1024 * 1024,
      pids: 16,
      outputBytes: 4096,
    },
    workBytes: 32 * 1024 * 1024,
  };
}

/** Only explicit OS/Docker plumbing is inherited. Real provider keys are never read. */
export function childEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_CONFIG",
  ]) {
    if (process.env[key] !== undefined) result[key] = process.env[key];
  }
  for (const key of [
    "MODEL_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
  ])
    result[key] = fakeCanary;
  return result;
}

/** A separate trusted Node process can be killed even if a future runner hangs. */
export function runBoundedNode(
  args: readonly string[],
  input: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...args], {
      env: childEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    const fail = (message: string) => {
      failure ??= new Error(message);
      if (process.platform === "win32" && child.pid !== undefined) {
        execFile(
          win32.join(
            process.env.SystemRoot ?? "C:\\Windows",
            "System32",
            "taskkill.exe",
          ),
          ["/PID", String(child.pid), "/T", "/F"],
          {
            timeout: 3000,
            windowsHide: true,
          },
          () => {
            child.kill("SIGKILL");
          },
        );
      } else {
        try {
          if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
      // A leaked helper must not hold inherited pipe handles open after Node is killed.
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const timer = setTimeout(() => fail("outer_timeout"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) fail("protocol_output_limit");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) fail("protocol_output_limit");
      // No raw future runner errors in public logs; result JSON is the only protocol.
    });
    child.on("error", (error) => {
      failure = error;
    });
    child.stdin.on("error", () => {
      /* Child may exit before consuming its input. */
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`runner_process_exit_${code}`));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    child.stdin.end(input);
  });
}

async function containersFor(runId: string): Promise<string[]> {
  assert.match(runId, /^[a-f0-9-]{36}$/);
  const { stdout } = await exec(
    "docker",
    ["ps", "-aq", "--filter", `label=leetkob.sandbox.run=${runId}`],
    { timeout: 5000, maxBuffer: 16_384, windowsHide: true },
  );
  const ids = stdout.trim() ? stdout.trim().split(/\s+/) : [];
  assert.ok(ids.length <= 32, "unexpected container count for one case");
  ids.forEach((id) => assert.match(id, /^[a-f0-9]{12,64}$/));
  return ids;
}

async function removeOwnContainers(runId: string) {
  const ids = await containersFor(runId);
  if (ids.length)
    await exec("docker", ["rm", "--force", ...ids], {
      timeout: 5000,
      maxBuffer: 16_384,
      windowsHide: true,
    });
  assert.deepEqual(
    await containersFor(runId),
    [],
    "cleanup left containers behind",
  );
}

export async function executeCase(
  request: SandboxRequest,
  policyInput: () => SandboxPolicy,
  runId: string,
): Promise<{ value: SandboxResult; policy: SandboxPolicy }> {
  assert.ok(
    existsSync(runnerUrl),
    "EXPECTED RED: src/sandbox/runner.ts is not implemented; no C++ was executed",
  );
  assert.equal(
    process.env.SANDBOX_RUN_ATTACKS,
    "1",
    "BLOCKED: real attack execution needs explicit SANDBOX_RUN_ATTACKS=1",
  );
  const policy = policyInput();
  const { stdout } = await exec("docker", ["info", "--format", "{{.OSType}}"], {
    timeout: 5000,
    windowsHide: true,
  });
  assert.equal(stdout.trim(), "linux");
  try {
    const payload = JSON.stringify({ request, policy, runId });
    const output = await runBoundedNode(
      [fileURLToPath(new URL("./runner-child.ts", import.meta.url))],
      payload,
      outerTimeoutMs,
      128 * 1024,
    );
    const value = JSON.parse(output) as SandboxResult;
    assert.deepEqual(
      await containersFor(runId),
      [],
      "runner returned before removing the container tree",
    );
    return { value, policy };
  } finally {
    // Independent outer cleanup runs on protocol, assertion and timeout failures too.
    await removeOwnContainers(runId);
  }
}
