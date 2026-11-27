import assert from "node:assert/strict";
import { test } from "node:test";
import { routeHardRules } from "../src/checker/hard-rules.ts";

test("routing distinguishes terminal hard-rule unsure from semantic work", () => {
  const routes = routeHardRules({
    solution: "synthetic",
    source: "using namespace std;\nint main() {}\n",
    statement: "Use an algorithm.",
    constraints: [
      { id: "alias", text: "Do not call `std::sort`.", deductionTenths: 10 },
      { id: "malformed", text: "Do not use sorting.", deductionTenths: 10 },
      { id: "semantic", text: "Use merge sort.", deductionTenths: 20 },
    ],
  });
  assert.deepEqual(routes, [
    {
      kind: "hard-rule",
      constraintId: "alias",
      verdict: "unsure",
      evidence: [],
    },
    {
      kind: "hard-rule",
      constraintId: "malformed",
      verdict: "unsure",
      evidence: [],
    },
    { kind: "semantic", constraintId: "semantic" },
  ]);
});
