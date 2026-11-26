import { setTimeout as sleep } from "node:timers/promises";
import { connectDocker, DockerError } from "./docker.ts";

// Trusted orphan backstop only: it receives a container ID/deadline, never submitted code.
const [endpoint, id, deadlineText] = process.argv.slice(2);
const deadline = Number(deadlineText);
if (
  !endpoint ||
  !id ||
  !/^[a-f0-9]{64}$/.test(id) ||
  !Number.isFinite(deadline) ||
  deadline > Date.now() + 120_000
) {
  process.exitCode = 1;
} else {
  process.env.DOCKER_HOST = endpoint;
  try {
    const engine = await connectDocker();
    for (;;) {
      try {
        await engine.call("GET", `/containers/${id}/json`);
      } catch (error) {
        if (error instanceof DockerError && error.status === 404) break;
      }
      if (Date.now() >= deadline) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await engine.call("DELETE", `/containers/${id}?force=true&v=true`);
            break;
          } catch (error) {
            if (error instanceof DockerError && error.status === 404) break;
            await sleep(100);
          }
        }
        break;
      }
      await sleep(250);
    }
  } catch {
    process.exitCode = 1;
  }
}
