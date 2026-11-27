import type {
  RunInSandbox,
  SandboxPolicy,
  SandboxRequest,
} from "../../src/sandbox/contract.ts";
import { runnerUrl } from "./harness.ts";

// Test adapter only. It never invokes a compiler or executes submitted source itself.
try {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += (chunk as Buffer).length;
    if (bytes > 128 * 1024) throw new Error("input_limit");
    chunks.push(chunk as Buffer);
  }
  const { request, policy, runId } = JSON.parse(
    Buffer.concat(chunks).toString("utf8"),
  ) as {
    request: SandboxRequest;
    policy: SandboxPolicy;
    runId: string;
  };
  const module = (await import(runnerUrl.href)) as {
    runInSandbox?: RunInSandbox;
  };
  if (typeof module.runInSandbox !== "function")
    throw new Error("missing_export");
  const signal = AbortSignal.timeout(25_000);
  const result = await module.runInSandbox(request, policy, { runId, signal });
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(JSON.stringify(result), (error) =>
      error ? reject(error) : resolve(),
    );
  });
  // No forced successful exit: leaked handles must be caught by the outer watchdog.
} catch {
  process.stderr.write("sandbox_test_adapter_failed\n");
  process.exitCode = 1;
}
