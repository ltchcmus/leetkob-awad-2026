import assert from "node:assert/strict";
import { test } from "node:test";
import { routeHardRules } from "../src/checker/hard-rules.ts";

test("routing distinguishes terminal macro-alias unsure from semantic work", () => {
  const routes = routeHardRules({
    solution: "synthetic",
    source:
      "#define ORDER std::sort\nint main() { int values[] = {2, 1}; ORDER(values, values + 2); }\n",
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
