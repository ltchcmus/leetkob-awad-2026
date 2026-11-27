import assert from "node:assert/strict";
import { test } from "node:test";
import { readDataset } from "../src/checker/cli.ts";
import { checkSubmission } from "../src/checker/orchestrator.ts";
import type { SemanticInput } from "../src/ai/types.ts";

test("shared checker only sends explicitly semantic work to its router", async () => {
  const calls: SemanticInput[] = [];
  const result = await checkSubmission(
    {
      labId: "synthetic",
      solution: "sample",
      statement: "Use an algorithm.",
      source: "using namespace std;\nint main() {}\n",
      constraints: [
        { id: "alias", text: "Do not call `std::sort`.", deductionTenths: 10 },
        { id: "semantic", text: "Use merge sort.", deductionTenths: 20 },
      ],
    },
    {
      async evaluate(input) {
        calls.push(input);
        return [
          {
            constraintId: "semantic",
            verdict: "pass",
            source: "model",
            evidence: [],
          },
        ];
      },
    },
  );
  assert.deepEqual(
    calls.map((call) => call.constraints),
    [[{ id: "semantic", text: "Use merge sort." }]],
  );
  assert.deepEqual(
    result.evaluations.map((row) => [row.verdict, row.source]),
    [
      ["unsure", "hard-rule"],
      ["pass", "model"],
    ],
  );
});

test("checker reads the published directory shape without using labels", () => {
  const inputs = readDataset("test/eval-cases/own");
  assert.equal(inputs.length, 5);
  assert.ok(
    inputs.every(
      (input) =>
        input.labId === "own-sort" && input.solution.startsWith("own-sort/"),
    ),
  );
  assert.ok(inputs.every((input) => input.constraints.length === 2));
});
