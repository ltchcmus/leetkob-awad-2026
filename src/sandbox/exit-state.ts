import { setTimeout as delay } from "node:timers/promises";

type ExitState = { Running: boolean; ExitCode: number; OOMKilled: boolean };

/** Docker can publish task exit before its asynchronous OOM event. */
export async function finalExitState<T extends ExitState>(
  initial: T,
  inspect: () => Promise<T>,
): Promise<T> {
  let state = initial;
  if (!state.Running && state.ExitCode === 137 && !state.OOMKilled) {
    for (let attempt = 0; attempt < 20; attempt++) {
      await delay(25);
      state = await inspect();
      if (state.OOMKilled) break;
    }
  }
  return state;
}
