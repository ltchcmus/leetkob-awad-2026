import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type ConstraintSpec = { id: string; text: string; deduction: number };
type Label = {
  solution: string;
  constraint: string;
  label: string;
  evidence: number[];
  tags: string[];
};
type Catalog = {
  expected: Map<string, Set<string>>;
  sources: Map<string, string[]>;
};

function readConstraints(root: string, problem: string): ConstraintSpec[] {
  const constraints = JSON.parse(
    readFileSync(join(root, "problems", problem, "constraints.json"), "utf8"),
  ) as ConstraintSpec[];
  if (
    !constraints.length ||
    new Set(constraints.map((c) => c.id)).size !== constraints.length ||
    constraints.some((c) => !c.id || !c.text || !Number.isFinite(c.deduction))
  )
    throw new Error("Invalid constraints");
  return constraints;
}

function validateProblemFiles(root: string, problem: string): void {
  if (
    !readFileSync(
      join(root, "problems", problem, "statement.md"),
      "utf8",
    ).trim()
  )
    throw new Error("Missing statement");
  const tests = readdirSync(join(root, "problems", problem, "tests"));
  const inputs = tests.filter((name) => name.endsWith(".in"));
  if (!inputs.length) throw new Error("Missing tests");
  for (const name of inputs)
    readFileSync(
      join(root, "problems", problem, "tests", name.replace(/\.in$/, ".out")),
    );
}

function readCatalog(root: string): Catalog {
  const expected = new Map<string, Set<string>>();
  const sources = new Map<string, string[]>();
  for (const problem of readdirSync(join(root, "problems"))) {
    const constraints = readConstraints(root, problem);
    validateProblemFiles(root, problem);
    const solutions = readdirSync(join(root, "solutions", problem)).filter(
      (name) => name.endsWith(".cpp"),
    );
    for (const name of solutions) {
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
  return { expected, sources };
}

function validateEvidence(label: Label, source: string[]): void {
  if (
    !Array.isArray(label.evidence) ||
    label.evidence.some(
      (n) =>
        !Number.isInteger(n) ||
        n < 1 ||
        n > source.length ||
        !source[n - 1]?.trim(),
    )
  )
    throw new Error("Invalid evidence");
  const correctCount =
    label.label === "pass"
      ? label.evidence.length === 0
      : label.evidence.length > 0;
  if (!correctCount) throw new Error("Invalid evidence");
}

function validateLabel(
  label: Label,
  catalog: Catalog,
  seen: Set<string>,
): string {
  const source = catalog.sources.get(label.solution);
  const key = `${label.solution}:${label.constraint}`;
  if (
    !source ||
    !catalog.expected.get(label.solution)?.has(label.constraint) ||
    seen.has(key) ||
    !["pass", "violation"].includes(label.label)
  )
    throw new Error("Invalid or duplicate pair");
  validateEvidence(label, source);
  const allowedTags = new Set([
    "obvious",
    "disguised",
    "trap",
    "injection",
    "style",
  ]);
  if (
    !Array.isArray(label.tags) ||
    !label.tags.length ||
    label.tags.some((tag) => !allowedTags.has(tag))
  )
    throw new Error("Invalid tags");
  return key;
}

export function validateOwnCases(root: string): {
  solutions: number;
  pairs: number;
  tags: string[];
} {
  const catalog = readCatalog(root);
  if (catalog.sources.size < 5)
    throw new Error("At least five solutions required");
  const seen = new Set<string>();
  const tags = new Set<string>();
  const lines = readFileSync(join(root, "labels.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  for (const line of lines) {
    const label = JSON.parse(line) as Label;
    const key = validateLabel(label, catalog, seen);
    for (const tag of label.tags) tags.add(tag);
    seen.add(key);
  }
  const pairs = [...catalog.expected.values()].reduce(
    (n, ids) => n + ids.size,
    0,
  );
  if (seen.size !== pairs || !tags.has("trap") || !tags.has("injection"))
    throw new Error("Incomplete labels or required tags");
  return {
    solutions: catalog.sources.size,
    pairs,
    tags: [...tags].sort((left, right) => left.localeCompare(right)),
  };
}
