import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { runInSandbox } from "../../src/sandbox/runner.ts";
import type { SandboxPolicy } from "../../src/sandbox/contract.ts";

test(
  "all ten own cases compile and are Accepted inside the reviewed sandbox",
  { timeout: 180000 },
  async () => {
    assert.equal(process.env.SANDBOX_RUN_ATTACKS, "1");
    const image = process.env.SANDBOX_JUDGE_IMAGE;
    assert.ok(image);
    const policy = {
      ...JSON.parse(readFileSync("judge/policy.json", "utf8")),
      image,
    } as SandboxPolicy;
    let accepted = 0;
    for (const folder of ["own", "pa4-extra"]) {
      const root = `test/eval-cases/${folder}`;
      const testDir = `${root}/problems/own-sort/tests`;
      const tests = readdirSync(testDir)
        .filter((n) => n.endsWith(".in"))
        .map((n) => ({
          id: n,
          input: readFileSync(`${testDir}/${n}`, "utf8"),
          expectedOutput: readFileSync(
            `${testDir}/${n.replace(/\.in$/, ".out")}`,
            "utf8",
          ),
        }));
      for (const file of readdirSync(`${root}/solutions/own-sort`)) {
        const text = readFileSync(`${root}/solutions/own-sort/${file}`, "utf8");
        const result = await runInSandbox(
          {
            submissionId: file,
            source: {
              text,
              sha256: createHash("sha256").update(text).digest("hex"),
            },
            tests,
          },
          policy,
          { runId: randomUUID(), signal: new AbortController().signal },
        );
        assert.equal(result.kind, "completed", JSON.stringify(result));
        if (result.kind !== "completed") return;
        assert.equal(
          result.judgeStatus,
          "AC",
          `${file}: ${JSON.stringify(result)}`,
        );
        assert.equal(result.cleanup.succeeded, true);
        accepted++;
      }
    }
    assert.equal(accepted, 10);
  },
);
