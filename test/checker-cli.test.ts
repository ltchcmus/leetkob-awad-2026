import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import type { TestContext } from "node:test";

type Prediction = {
  solution: string;
  constraint: string;
  verdict: "pass" | "violation" | "unsure";
  evidence: Array<{ line: number; text: string }>;
};

function runCli(
  data: string,
  predictions: string,
  options: { preload?: string } = {},
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const arguments_ = [
      ...(options.preload === undefined ? [] : ["--require", options.preload]),
      "src/checker/cli.ts",
      "--data",
      data,
      "--predictions",
      predictions,
    ];
    const child = spawn(process.execPath, arguments_, {
      cwd: process.cwd(),
      env: { ...process.env, MODEL_OFF: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stderr }));
  });
}

function writeOwnDataset(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "leetkob-g5-checker-"));
  const solutions = join(root, "solutions");
  mkdirSync(solutions);
  writeFileSync(join(root, "statement.md"), "Sort the input values.\n");
  writeFileSync(
    join(root, "constraints.json"),
    JSON.stringify([
      { id: "C1", text: "Do not call `std::sort`.", deductionTenths: 15 },
      { id: "C2", text: "Use merge sort.", deductionTenths: 20 },
    ]),
  );
  writeFileSync(
    join(solutions, "compliant.cpp"),
    "namespace student { void sort(int*, int*) {} }\nint main() { return 0; }\n",
  );
  writeFileSync(
    join(solutions, "banned.cpp"),
    "int main() { int a[] = {2, 1}; std::sort(a, a + 2); }\n",
  );
  const predictions = join(root, "predictions.jsonl");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, predictions };
}

test("G5 proposed CLI: --data and --predictions write deterministic model-off JSONL with hard-rule precedence", async (t) => {
  const { root, predictions } = writeOwnDataset(t);
  const result = await runCli(root, predictions);
  assert.equal(result.code, 0, result.stderr);
  const rows = readFileSync(predictions, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Prediction);
  assert.deepEqual(rows, [
    {
      solution: "banned",
      constraint: "C1",
      verdict: "violation",
      evidence: [
        {
          line: 1,
          text: "int main() { int a[] = {2, 1}; std::sort(a, a + 2); }",
        },
      ],
    },
    { solution: "banned", constraint: "C2", verdict: "unsure", evidence: [] },
    { solution: "compliant", constraint: "C1", verdict: "pass", evidence: [] },
    {
      solution: "compliant",
      constraint: "C2",
      verdict: "unsure",
      evidence: [],
    },
  ]);
  for (const row of rows) {
    assert.equal(Object.hasOwn(row, "deduction"), false);
    assert.equal(Object.hasOwn(row, "deductionTenths"), false);
  }
});

test("G5 proposed CLI: MODEL_OFF does not use node network connection APIs", async (t) => {
  const { root, predictions } = writeOwnDataset(t);
  const networkGuard = join(root, "network-guard.cjs");
  writeFileSync(
    networkGuard,
    [
      "const deny = () => { throw new Error('network attempted'); };",
      "const net = require('node:net');",
      "net.connect = deny; net.createConnection = deny;",
      "const tls = require('node:tls'); tls.connect = deny;",
    ].join("\n"),
  );
  const result = await runCli(root, predictions, { preload: networkGuard });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(readFileSync(predictions, "utf8").includes('"unsure"'));
});

test("G5 proposed CLI: invalid JSON fails without producing predictions", async (t) => {
  const { root, predictions } = writeOwnDataset(t);
  writeFileSync(join(root, "constraints.json"), "{ invalid JSON");
  const result = await runCli(root, predictions);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Cannot read valid JSON constraints/);
  assert.throws(() => readFileSync(predictions, "utf8"));
});

test("G5 proposed CLI: missing proposed dataset paths fail without predictions", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "leetkob-g5-missing-"));
  const predictions = join(root, "predictions.jsonl");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = await runCli(root, predictions);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /ENOENT/);
  assert.throws(() => readFileSync(predictions, "utf8"));
});

test("G5 proposed CLI: duplicate proposed constraint ids are rejected", async (t) => {
  const { root, predictions } = writeOwnDataset(t);
  writeFileSync(
    join(root, "constraints.json"),
    JSON.stringify([
      { id: "C1", text: "Do not call `std::sort`.", deductionTenths: 15 },
      { id: "C1", text: "Use merge sort.", deductionTenths: 20 },
    ]),
  );
  const result = await runCli(root, predictions);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Duplicate constraint id: C1/);
  assert.throws(() => readFileSync(predictions, "utf8"));
});
