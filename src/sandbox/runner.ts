import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { connectDocker, dockerEnvironment, DockerError } from "./docker.ts";
import type { Engine } from "./docker.ts";
import { SandboxFailure, validateInputs } from "./validation.ts";
import type {
  CleanupReport,
  IsolationEvidence,
  PhaseReason,
  PhaseResult,
  RunInSandbox,
  SandboxContext,
  SandboxPolicy,
  SandboxResult,
} from "./contract.ts";

type Infra = Extract<SandboxResult, { kind: "infrastructure_error" }>;
type Inspect = {
  Id: string;
  Config: {
    User: string;
    Env: string[];
    Labels: Record<string, string>;
    Entrypoint: string[];
  };
  State: {
    Running: boolean;
    ExitCode: number;
    OOMKilled: boolean;
    Error: string;
  };
  HostConfig: {
    NetworkMode: string;
    Privileged: boolean;
    ReadonlyRootfs: boolean;
    CapDrop: string[];
    SecurityOpt: string[];
    Memory: number;
    MemorySwap: number;
    PidsLimit: number;
    NanoCpus: number;
  };
  Mounts: { Type: string; Destination: string }[];
};
type Stats = {
  cpu_stats?: { cpu_usage?: { total_usage?: number } };
  memory_stats?: { usage?: number; max_usage?: number };
};
const labelKey = "leetkob.sandbox.run";
const maxArtifactBytes = 16 * 1024 * 1024;
const allowedEnv = ["PATH", "HOME", "LANG", "LC_ALL", "HOSTNAME", "TMPDIR"];

async function listed(engine: Engine, runId: string) {
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`${labelKey}=${runId}`] }),
  );
  return engine.call<{ Id: string }[]>(
    "GET",
    `/containers/json?all=true&filters=${filters}`,
  );
}
async function cleanup(engine: Engine, runId: string): Promise<CleanupReport> {
  try {
    const containers = await listed(engine, runId);
    if (containers.length > 202) throw new SandboxFailure("cleanup_failed");
    for (const item of containers)
      await engine.call("DELETE", `/containers/${item.Id}?force=true&v=true`);
    const remaining = await listed(engine, runId);
    return {
      attempted: true,
      succeeded: remaining.length === 0,
      remainingContainerIds: remaining.map((c) => c.Id),
    };
  } catch {
    return { attempted: true, succeeded: false, remainingContainerIds: [] };
  }
}
function failure(code: Infra["code"], report: CleanupReport): Infra {
  return {
    kind: "infrastructure_error",
    code,
    retryable:
      report.succeeded &&
      [
        "daemon_unavailable",
        "container_start_failed",
        "controller_timeout",
      ].includes(code),
    cleanup: report,
  };
}
function evidence(
  value: Inspect,
  image: string,
  phase: "compile" | "run",
  runId: string,
): IsolationEvidence {
  return {
    containerId: value.Id,
    runId,
    phase,
    imageDigest: image,
    networkMode: value.HostConfig.NetworkMode,
    user: value.Config.User,
    privileged: value.HostConfig.Privileged,
    readonlyRootfs: value.HostConfig.ReadonlyRootfs,
    capDrop: value.HostConfig.CapDrop,
    noNewPrivileges: value.HostConfig.SecurityOpt.includes("no-new-privileges"),
    mounts: value.Mounts.map((m) => ({
      type: m.Type,
      destination: m.Destination,
    })),
    memoryBytes: value.HostConfig.Memory,
    memorySwapBytes: value.HostConfig.MemorySwap,
    pids: value.HostConfig.PidsLimit,
    cpuQuota: value.HostConfig.NanoCpus / 1e9,
    environmentNames: value.Config.Env.map((s) => s.split("=", 1)[0]!),
  };
}
function assertIsolation(value: IsolationEvidence, policy: SandboxPolicy) {
  const limit = policy[value.phase];
  if (
    value.networkMode !== "none" ||
    value.user !== "65534:65534" ||
    value.privileged ||
    !value.readonlyRootfs ||
    JSON.stringify(value.capDrop) !== '["ALL"]' ||
    !value.noNewPrivileges ||
    value.mounts.some((m) => m.type !== "tmpfs" || m.destination !== "/work") ||
    value.memoryBytes !== limit.memoryBytes ||
    value.memorySwapBytes !== limit.memoryBytes ||
    value.pids !== limit.pids ||
    value.cpuQuota !== policy.cpuQuota ||
    value.environmentNames.some((name) => !allowedEnv.includes(name))
  )
    throw new SandboxFailure("invalid_policy");
}
function utf8(buffer: Buffer) {
  // Ignore an incomplete final UTF-8 sequence; never expand a capped byte buffer.
  let text = buffer.toString("utf8");
  while (Buffer.byteLength(text) > buffer.length) text = text.slice(0, -1);
  return text;
}

async function phase(
  engine: Engine,
  name: "compile" | "run",
  payload: object,
  policy: SandboxPolicy,
  context: SandboxContext,
  isolation: IsolationEvidence[],
): Promise<{ result: PhaseResult; artifact: string }> {
  const limits = policy[name];
  if (context.signal.aborted) throw new SandboxFailure("cancelled");
  const created = await engine
    .call<{ Id: string }>(
      "POST",
      `/containers/create?name=lk-${context.runId}-${randomUUID().slice(0, 8)}`,
      {
        Image: policy.image,
        User: "65534:65534",
        WorkingDir: "/work",
        Entrypoint: ["/usr/bin/python3", "-I", "/opt/judge/phase.py"],
        Cmd: [name],
        Env: [
          "PATH=/usr/bin:/bin",
          "HOME=/work",
          "LANG=C.UTF-8",
          "TMPDIR=/work",
        ],
        Labels: { [labelKey]: context.runId },
        OpenStdin: true,
        StdinOnce: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        HostConfig: {
          NetworkMode: "none",
          ReadonlyRootfs: true,
          Privileged: false,
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges"],
          Memory: limits.memoryBytes,
          MemorySwap: limits.memoryBytes,
          PidsLimit: limits.pids,
          NanoCpus: Math.round(policy.cpuQuota * 1e9),
          Tmpfs: {
            "/work": `rw,exec,nosuid,nodev,size=${policy.workBytes},mode=1777`,
          },
          LogConfig: { Type: "none", Config: {} },
          RestartPolicy: { Name: "no" },
        },
      },
    )
    .catch((error: unknown) => {
      throw new SandboxFailure(
        error instanceof DockerError && error.status === 0
          ? "daemon_unavailable"
          : "container_start_failed",
      );
    });
  const id = created.Id;
  const inspected = await engine.call<Inspect>("GET", `/containers/${id}/json`);
  const record = evidence(inspected, policy.image, name, context.runId);
  assertIsolation(record, policy);
  isolation.push(record);
  // Detached trusted process survives a worker crash; ordinary deadlines remain stricter.
  const watchdog = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./watchdog.ts", import.meta.url)),
      engine.endpoint,
      id,
      String(Date.now() + 8000 + limits.wallTimeMs),
    ],
    {
      env: dockerEnvironment(),
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    },
  );
  await new Promise<void>((resolve, reject) => {
    watchdog.once("spawn", resolve);
    watchdog.once("error", () =>
      reject(new SandboxFailure("container_start_failed")),
    );
  });
  watchdog.unref();
  let removed = false;
  const child = spawn(
    "docker",
    ["--host", engine.endpoint, "start", "--attach", "--interactive", id],
    {
      env: dockerEnvironment(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let ready = false,
    closed = false,
    retained = 0,
    protocolBytes = 0;
  let prefix = Buffer.alloc(0);
  const out: Buffer[] = [],
    err: Buffer[] = [],
    artifact: Buffer[] = [];
  let reason: PhaseReason | undefined;
  let infra: Infra["code"] | undefined;
  let killPromise: Promise<unknown> | undefined;
  const kill = () => {
    killPromise ??= engine
      .call("POST", `/containers/${id}/kill?signal=SIGKILL`)
      .catch((error: unknown) => {
        if (!(error instanceof DockerError) || error.status !== 409)
          infra ??= "daemon_unavailable";
      });
  };
  const consume = (data: Buffer, stream: "stdout" | "stderr") => {
    if (name === "compile" && stream === "stdout") {
      protocolBytes += data.length;
      if (protocolBytes > Math.ceil((maxArtifactBytes * 4) / 3) + 16) {
        infra = "controller_error";
        kill();
      } else artifact.push(data);
      return;
    }
    const take = Math.min(data.length, limits.outputBytes - retained);
    if (take > 0) {
      (stream === "stdout" ? out : err).push(data.subarray(0, take));
      retained += take;
    }
    if (data.length > take) {
      reason ??= "output_limit";
      kill();
    }
  };
  let readyResolve: () => void = () => undefined;
  let readyReject: (error: Error) => void = () => undefined;
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const startupTimer = setTimeout(() => {
    infra = "container_start_failed";
    kill();
    readyReject(new SandboxFailure(infra));
  }, 5000);
  const cancel = () => {
    infra = "cancelled";
    kill();
    readyReject(new SandboxFailure("cancelled"));
  };
  context.signal.addEventListener("abort", cancel, { once: true });
  child.stdout.on("data", (chunk: Buffer) => {
    if (!ready) {
      prefix = Buffer.concat([prefix, chunk]);
      if (prefix.length < 6) return;
      if (prefix.subarray(0, 6).toString() !== "READY\n") {
        infra = "container_start_failed";
        kill();
        readyReject(new SandboxFailure(infra));
        return;
      }
      ready = true;
      readyResolve();
      if (prefix.length > 6) consume(prefix.subarray(6), "stdout");
      prefix = Buffer.alloc(0);
    } else consume(chunk, "stdout");
  });
  child.stderr.on("data", (chunk: Buffer) => consume(chunk, "stderr"));
  child.stdin.on("error", () => undefined);
  child.on("error", () => {
    infra = "container_start_failed";
    readyReject(new SandboxFailure(infra));
  });
  const closePromise = new Promise<void>((resolve) =>
    child.on("close", () => {
      closed = true;
      if (!ready) readyReject(new SandboxFailure("container_start_failed"));
      resolve();
    }),
  );
  let cpuTimeMs = 0,
    memoryPeakBytes = 0;
  let started: number;
  let wallTimer: ReturnType<typeof setTimeout> | undefined;
  let state: Inspect["State"] | undefined;
  const sample = async () => {
    const stats = await engine.call<Stats>(
      "GET",
      `/containers/${id}/stats?stream=false&one-shot=true`,
    );
    const cpu = stats.cpu_stats?.cpu_usage?.total_usage;
    const memory = stats.memory_stats?.max_usage ?? stats.memory_stats?.usage;
    if (typeof cpu === "number" && Number.isFinite(cpu))
      cpuTimeMs = Math.max(cpuTimeMs, cpu / 1e6);
    if (typeof memory === "number" && Number.isFinite(memory))
      memoryPeakBytes = Math.max(memoryPeakBytes, memory);
  };
  try {
    await readyPromise;
    clearTimeout(startupTimer);
    await sample(); // Observe cgroup before releasing any compiler/submitted work.
    if (!memoryPeakBytes) throw new SandboxFailure("measurement_unavailable");
    started = performance.now();
    wallTimer = setTimeout(() => {
      killPromise ??= engine
        .call("POST", `/containers/${id}/kill?signal=SIGKILL`)
        .then(() => {
          reason ??= "wall_clock";
        })
        .catch((error: unknown) => {
          if (!(error instanceof DockerError) || error.status !== 409)
            infra ??= "daemon_unavailable";
        });
    }, limits.wallTimeMs);
    child.stdin.end(
      JSON.stringify({ ...payload, cpuTimeMs: limits.cpuTimeMs }),
    );
    for (;;) {
      state = (await engine.call<Inspect>("GET", `/containers/${id}/json`))
        .State;
      if (!state.Running) break;
      await sample();
      if (cpuTimeMs >= limits.cpuTimeMs) {
        reason ??= "cpu_time";
        kill();
      }
      if (context.signal.aborted) cancel();
      if (infra) throw new SandboxFailure(infra);
      await sleep(10);
    }
    clearTimeout(wallTimer);
    const wallTimeMs = performance.now() - started;
    if (!closed)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new SandboxFailure("controller_timeout")),
          3000,
        );
        void closePromise.then(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    if (killPromise) await killPromise;
    if (infra) throw new SandboxFailure(infra);
    if (state.Error) throw new SandboxFailure("container_start_failed");
    if (name === "compile" && state.ExitCode === 125)
      throw new SandboxFailure("compiler_unavailable");
    if (state.OOMKilled) reason = "memory";
    reason ??=
      state.ExitCode === 0
        ? "ok"
        : name === "compile"
          ? "compile_error"
          : state.ExitCode >= 128
            ? "signal"
            : "exit_code";
    const status =
      reason === "memory"
        ? "MLE"
        : reason === "cpu_time" || reason === "wall_clock"
          ? "TLE"
          : reason === "ok"
            ? "AC"
            : name === "compile"
              ? "CE"
              : "RE";
    const stdout = utf8(Buffer.concat(out)),
      stderr = utf8(Buffer.concat(err));
    const encoded = Buffer.concat(artifact).toString("ascii");
    if (
      name === "compile" &&
      status === "AC" &&
      (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
        Buffer.from(encoded, "base64").length > maxArtifactBytes)
    )
      throw new SandboxFailure("compiler_unavailable");
    await engine.call("DELETE", `/containers/${id}?force=true&v=true`);
    removed = true;
    return {
      result: {
        status,
        reason,
        stdout,
        stderr,
        capturedBytes: Buffer.byteLength(stdout) + Buffer.byteLength(stderr),
        outputTruncated: reason === "output_limit",
        cpuTimeMs,
        wallTimeMs,
        memoryPeakBytes,
        oomKilled: state.OOMKilled,
      },
      artifact: encoded,
    };
  } finally {
    clearTimeout(startupTimer);
    clearTimeout(wallTimer);
    context.signal.removeEventListener("abort", cancel);
    if (removed) watchdog.kill("SIGKILL");
    if (!closed) {
      kill();
      child.kill("SIGKILL");
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    }
    if (killPromise) await killPromise;
  }
}

export const runInSandbox: RunInSandbox = async (
  input,
  inputPolicy,
  context,
) => {
  const empty: CleanupReport = {
    attempted: true,
    succeeded: true,
    remainingContainerIds: [],
  };
  let validated;
  try {
    validated = validateInputs(input, inputPolicy, context);
  } catch (error) {
    return failure(
      error instanceof SandboxFailure && error.message === "invalid_policy"
        ? "invalid_policy"
        : "invalid_request",
      empty,
    );
  }
  if (context.signal.aborted) return failure("cancelled", empty);
  const { request, policy } = validated;
  let engine: Engine;
  try {
    engine = await connectDocker();
  } catch {
    return failure("daemon_unavailable", empty);
  }
  let result: SandboxResult;
  try {
    const existing = await listed(engine, context.runId);
    if (existing.length)
      return failure("invalid_request", {
        attempted: false,
        succeeded: false,
        remainingContainerIds: existing.map((c) => c.Id),
      });
    const info = await engine.call<{ OSType: string }>("GET", "/info");
    if (info.OSType !== "linux") throw new SandboxFailure("invalid_policy");
    let image: Inspect;
    try {
      image = await engine.call<Inspect>(
        "GET",
        `/images/${encodeURIComponent(policy.image)}/json`,
      );
    } catch (error) {
      if (error instanceof DockerError && error.status === 404)
        throw new SandboxFailure("image_unavailable");
      throw error;
    }
    if (
      image.Config.Labels?.["leetkob.judge.protocol"] !== "1" ||
      image.Config.User !== "65534:65534" ||
      image.Config.Env.some((v) => !allowedEnv.includes(v.split("=", 1)[0]!))
    )
      throw new SandboxFailure("invalid_policy");
    const isolation: IsolationEvidence[] = [];
    const compiled = await phase(
      engine,
      "compile",
      { source: request.source.text },
      policy,
      context,
      isolation,
    );
    const tests: { testId: string; result: PhaseResult }[] = [];
    let judgeStatus = compiled.result.status;
    if (judgeStatus === "AC") {
      for (const test of request.tests) {
        const ran = await phase(
          engine,
          "run",
          { artifact: compiled.artifact, input: test.input },
          policy,
          context,
          isolation,
        );
        let observed = ran.result;
        if (
          observed.status === "AC" &&
          JSON.stringify(observed.stdout.match(/\S+/gu) ?? []) !==
            JSON.stringify(test.expectedOutput.match(/\S+/gu) ?? [])
        ) {
          observed = { ...observed, status: "WA", reason: "wrong_answer" };
        }
        tests.push({ testId: test.id, result: observed });
        judgeStatus = observed.status;
        if (judgeStatus !== "AC") break;
      }
    }
    result = {
      kind: "completed",
      submissionId: request.submissionId,
      sourceSha256: request.source.sha256,
      policyVersion: policy.version,
      judgeStatus,
      compile: compiled.result,
      tests,
      isolation,
      cleanup: empty,
    };
  } catch (error) {
    const code =
      error instanceof SandboxFailure
        ? (error.message as Infra["code"])
        : error instanceof DockerError
          ? "daemon_unavailable"
          : "controller_error";
    result = failure(code, empty);
  }
  const report = await cleanup(engine, context.runId);
  if (!report.succeeded) return failure("cleanup_failed", report);
  return { ...result, cleanup: report };
};
