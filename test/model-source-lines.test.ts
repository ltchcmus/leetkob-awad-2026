import assert from "node:assert/strict";
import { test } from "node:test";
import { makePrompt } from "../src/ai/prompt.ts";
import { validateModel } from "../src/ai/schema.ts";

for (const newline of ["\n", "\r\n"]) {
  test(
    "numbered sanitized lines retain original coordinates " +
      JSON.stringify(newline),
    () => {
      const source = ["// private", "", "int f() {", "  return 1;", "}"].join(
        newline,
      );
      const prepared = makePrompt(
        {
          labId: "test",
          source,
          statement: "Return two.",
          constraints: [{ id: "C", text: "Return two." }],
        },
        [],
      );
      assert.ok(prepared);
      const data = JSON.parse(prepared.prompt.split("\n").at(-1)!);
      assert.deepEqual(data.sourceLines[3], {
        line: 4,
        text: "  return 1;",
        evidenceEligible: true,
      });
      assert.equal(data.sourceLines[0].evidenceEligible, false);
      assert.ok(!prepared.prompt.includes("private"));
      const result = (line: number) =>
        JSON.stringify([
          {
            constraintId: "C",
            verdict: "violation",
            evidence: [{ line, text: "  return 1;" }],
          },
        ]);
      assert.ok(
        "results" in
          validateModel(result(4), ["C"], prepared.original, prepared.visible),
      );
      assert.deepEqual(
        validateModel(result(3), ["C"], prepared.original, prepared.visible),
        { reason: "invalid_evidence" },
      );
    },
  );
}
