import assert from "node:assert/strict";
import { test } from "node:test";
import { finalExitState } from "../../src/sandbox/exit-state.ts";

test("terminal exit waits for delayed Docker OOM attribution", async () => {
  let reads = 0;
  const initial = { Running: false, ExitCode: 137, OOMKilled: false };
  const result = await finalExitState(initial, async () => ({
    ...initial,
    OOMKilled: ++reads === 2,
  }));
  assert.equal(result.OOMKilled, true);
  assert.equal(reads, 2);
});

test("a SIGKILL exit code alone never establishes memory exhaustion", async () => {
  const initial = { Running: false, ExitCode: 137, OOMKilled: false };
  assert.equal(
    (await finalExitState(initial, async () => initial)).OOMKilled,
    false,
  );
});
