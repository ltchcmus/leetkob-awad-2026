import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function validateOwnCases(root: string): {
  solutions: number;
  pairs: number;
  tags: string[];
} {
  const expected = new Map<string, Set<string>>();
  const sources = new Map<string, string[]>();
  for (const problem of readdirSync(join(root, "problems"))) {
    const constraints = JSON.parse(
      readFileSync(join(root, "problems", problem, "constraints.json"), "utf8"),
    ) as Array<{ id: string; text: string; deduction: number }>;
    if (
      !constraints.length ||
      new Set(constraints.map((c) => c.id)).size !== constraints.length ||
      constraints.some((c) => !c.id || !c.text || !Number.isFinite(c.deduction))
    )
      throw new Error("Invalid constraints");
    if (
      !readFileSync(
        join(root, "problems", problem, "statement.md"),
        "utf8",
      ).trim()
    )
      throw new Error("Missing statement");
    const tests = readdirSync(join(root, "problems", problem, "tests"));
    if (!tests.some((name) => name.endsWith(".in")))
      throw new Error("Missing tests");
    for (const name of tests.filter((name) => name.endsWith(".in")))
      readFileSync(
        join(root, "problems", problem, "tests", name.replace(/\.in$/, ".out")),
      );
    for (const name of readdirSync(join(root, "solutions", problem)).filter(
      (name) => name.endsWith(".cpp"),
    )) {
      const id = `${problem}/${name.slice(0, -4)}`;
      sources.set(
        id,
        readFileSync(join(root, "solutions", problem, name), "utf8").split(
          /\r?\n/,
        ),
      );
      expected.set(id, new Set(constraints.map((c) => c.id)));
    }
  }
  if (sources.size < 5) throw new Error("At least five solutions required");
  const seen = new Set<string>();
  const tags = new Set<string>();
  const allowedTags = new Set([
    "obvious",
    "disguised",
    "trap",
    "injection",
    "style",
  ]);
  for (const line of readFileSync(join(root, "labels.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)) {
    const label = JSON.parse(line) as {
      solution: string;
      constraint: string;
      label: string;
      evidence: number[];
      tags: string[];
    };
    const source = sources.get(label.solution);
    const key = `${label.solution}:${label.constraint}`;
    if (
      !source ||
      !expected.get(label.solution)?.has(label.constraint) ||
      seen.has(key) ||
      !["pass", "violation"].includes(label.label)
    )
      throw new Error("Invalid or duplicate pair");
    if (
      !Array.isArray(label.evidence) ||
      label.evidence.some(
        (n) =>
          !Number.isInteger(n) ||
          n < 1 ||
          n > source.length ||
          !source[n - 1]?.trim(),
      ) ||
      (label.label === "pass"
        ? label.evidence.length !== 0
        : label.evidence.length === 0)
    )
      throw new Error("Invalid evidence");
    if (
      !Array.isArray(label.tags) ||
      !label.tags.length ||
      label.tags.some((tag) => !allowedTags.has(tag))
    )
      throw new Error("Invalid tags");
    for (const tag of label.tags) tags.add(tag);
    seen.add(key);
  }
  const pairs = [...expected.values()].reduce((n, ids) => n + ids.size, 0);
  if (seen.size !== pairs || !tags.has("trap") || !tags.has("injection"))
    throw new Error("Incomplete labels or required tags");
  return { solutions: sources.size, pairs, tags: [...tags].sort() };
}
