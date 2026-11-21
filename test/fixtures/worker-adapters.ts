// Offline orchestration fixture only: it does not compile, execute or judge C++.
import type { PipelineAdapters } from "../../src/worker/types.ts";

export const adapters: PipelineAdapters = {
  runInSandbox: async () => {
    if (process.env.TEST_BLOCK_SANDBOX === "1") return new Promise(() => {});
    return { kind: "judged", judgeStatus: "AC", tests: ["AC"] };
  },
  checkSubmission: async (input) => ({
    solution: input.solution,
    evaluations: input.constraints.map((c) => ({
      constraintId: c.id,
      verdict: "pass",
      source: "hard-rule",
      evidence: [],
    })),
  }),
};
