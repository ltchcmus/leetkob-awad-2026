import { runInSandbox } from "../../src/sandbox/runner.ts";
import { connectDocker, DockerError } from "../../src/sandbox/docker.ts";
import type {
  SandboxRequest,
  SandboxPolicy,
} from "../../src/sandbox/contract.ts";
import { setTimeout as sleep } from "node:timers/promises";

let raw = "";
for await (const chunk of process.stdin) {
  raw += String(chunk);
  if (Buffer.byteLength(raw) > 128 * 1024) throw new Error("input_limit");
}
const { request, policy, runId, mode } = JSON.parse(raw) as {
  request: SandboxRequest;
  policy: SandboxPolicy;
  runId: string;
  mode: string;
};
const abort = new AbortController();
const result = runInSandbox(request, policy, {
  runId,
  signal: AbortSignal.any([AbortSignal.timeout(25_000), abort.signal]),
});
if (mode === "crash" || mode === "cancel") {
  let observedProgram = false;
  const engine = await connectDocker();
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`leetkob.sandbox.run=${runId}`] }),
  );
  observe: for (let i = 0; i < 200; i++) {
    const containers = await engine.call<{ Id: string }[]>(
      "GET",
      `/containers/json?filters=${filters}`,
    );
    for (const c of containers) {
      try {
        const inspected = await engine.call<{ Config: { Cmd: string[] } }>(
          "GET",
          `/containers/${c.Id}/json`,
        );
        if (inspected.Config.Cmd[0] === "run") {
          const probe = await engine.call<{ Id: string }>(
            "POST",
            `/containers/${c.Id}/exec`,
            {
              User: "65534:65534",
              Privileged: false,
              AttachStdout: false,
              AttachStderr: false,
              Cmd: [
                "/bin/sh",
                "-c",
                'read name < /proc/1/comm; test "$name" = program',
              ],
            },
          );
          await engine.call("POST", `/exec/${probe.Id}/start`, {
            Detach: false,
            Tty: false,
          });
          for (let probeAttempt = 0; probeAttempt < 20; probeAttempt++) {
            const observed = await engine.call<{
              ExitCode: number;
              Running: boolean;
            }>("GET", `/exec/${probe.Id}/json`);
            if (observed.ExitCode === 0) {
              observedProgram = true;
              if (mode === "crash") process.exit(77);
              abort.abort();
              break observe;
            }
            if (!observed.Running) break;
            await sleep(5);
          }
        }
      } catch (error) {
        // Listing can race normal removal while compile advances to run.
        if (
          !(error instanceof DockerError) ||
          ![404, 409].includes(error.status)
        )
          throw error;
      }
    }
    await sleep(25);
  }
  if (!observedProgram) throw new Error("program_start_not_observed");
}
process.stdout.write(JSON.stringify(await result));
