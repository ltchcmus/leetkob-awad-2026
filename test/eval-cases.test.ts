import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateOwnCases } from "./eval-cases/validate.ts";
import { verifyFiles } from "./eval-cases/verify-official.ts";

const own = fileURLToPath(new URL("./eval-cases/own/", import.meta.url));

test("own evaluation cases have complete labels, evidence, tests, trap and injection tags", () => {
  const result = validateOwnCases(own);
  assert.equal(result.solutions, 5);
  assert.equal(result.pairs, 10);
  assert.ok(result.tags.includes("trap") && result.tags.includes("injection"));
});

test("own-case validation rejects duplicated pairs and invalid evidence", (t) => {
  const copy = mkdtempSync(join(tmpdir(), "leetkob-cases-"));
  t.after(() => rmSync(copy, { recursive: true, force: true }));
  cpSync(own, copy, { recursive: true });
  const labelsPath = join(copy, "labels.jsonl");
  const original = readFileSync(labelsPath, "utf8");
  writeFileSync(labelsPath, original + original.split("\n")[0] + "\n");
  assert.throws(() => validateOwnCases(copy), /duplicate pair/);
  const labels = original
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { label: string; evidence: number[] });
  labels.find((label) => label.label === "violation")!.evidence = [99999];
  writeFileSync(
    labelsPath,
    labels.map((label) => JSON.stringify(label)).join("\n") + "\n",
  );
  assert.throws(() => validateOwnCases(copy), /Invalid evidence/);
});

test("official integrity verifier catches a byte change without modifying published data", (t) => {
  const copy = mkdtempSync(join(tmpdir(), "leetkob-integrity-"));
  t.after(() => rmSync(copy, { recursive: true, force: true }));
  const manifest = {
    "sample.txt":
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  };
  writeFileSync(join(copy, "sample.txt"), "abc");
  verifyFiles(copy, manifest);
  writeFileSync(join(copy, "sample.txt"), "abcd");
  assert.throws(() => verifyFiles(copy, manifest), /Official dataset changed/);
  assert.throws(
    () => verifyFiles(copy, { "../outside": manifest["sample.txt"] }),
    /Invalid integrity manifest/,
  );
});
