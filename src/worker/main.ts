import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { WorkflowRepository } from "../db/workflow-repository.ts";
import { processOneJob } from "./worker.ts";
import type { PipelineAdapters, WorkerEvent } from "./types.ts";

function integer(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error("Invalid worker configuration");
  return value;
}

async function main(): Promise<void> {
  const databasePath = process.env.DATABASE_PATH;
  const adapterPath = process.env.WORKER_ADAPTER_MODULE;
  if (
    !databasePath ||
    databasePath === ":memory:" ||
    !adapterPath ||
    !isAbsolute(adapterPath)
  )
    throw new Error(
      "Persistent database and explicit trusted adapter module required",
    );
  const module = (await import(pathToFileURL(adapterPath).href)) as {
    adapters?: PipelineAdapters;
  };
  if (
    !module.adapters ||
    typeof module.adapters.runInSandbox !== "function" ||
    typeof module.adapters.checkSubmission !== "function"
  )
    throw new Error("Invalid adapter module");
  const leaseMs = integer("WORKER_LEASE_MS", 30_000, 100, 3_600_000);
  const once = process.env.WORKER_ONCE === "1";
  const concurrency = once ? 1 : integer("WORKER_CONCURRENCY", 1, 1, 4);
  const pollMs = integer("WORKER_POLL_MS", 250, 10, 60_000);
  const adapterTimeoutMs = integer(
    "WORKER_ADAPTER_TIMEOUT_MS",
    300_000,
    1,
    3_600_000,
  );
  const repo = new WorkflowRepository(databasePath);
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  const log = (event: WorkerEvent) => console.info(JSON.stringify(event));
  try {
    log({ event: "worker.ready" });
    const adapters = module.adapters;
    const runLane = async () => {
      const workerId = randomUUID();
      while (!stop.signal.aborted) {
        const result = await processOneJob(repo, adapters, {
          workerId,
          leaseMs,
          adapterTimeoutMs,
          signal: stop.signal,
          onEvent: log,
        });
        if (result === "quarantined")
          throw new Error("Operator reconciliation is required");
        if (once) break;
        if (result === "idle" || result === "retry") {
          try {
            await delay(pollMs, undefined, { signal: stop.signal });
          } catch {
            if (!stop.signal.aborted) throw new Error("Worker polling failed");
          }
        }
      }
    };
    const lanes = await Promise.allSettled(
      Array.from({ length: concurrency }, () =>
        runLane().catch((error: unknown) => {
          stop.abort();
          throw error;
        }),
      ),
    );
    if (lanes.some((lane) => lane.status === "rejected"))
      throw new Error("Worker lane failed");
  } finally {
    process.removeListener("SIGTERM", shutdown);
    process.removeListener("SIGINT", shutdown);
    repo.close();
  }
}

try {
  await main();
} catch {
  console.error(
    JSON.stringify({
      event: "worker.failed",
      code: "worker_configuration_or_storage_error",
    }),
  );
  process.exitCode = 1;
}
