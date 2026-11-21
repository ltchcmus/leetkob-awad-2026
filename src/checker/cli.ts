import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { evaluateHardRules } from "./hard-rules.ts";
import type { CheckerConstraint, CheckerInput } from "./hard-rules.ts";

type CliOptions = { data: string; predictions: string };

type PredictionRow = {
  solution: string;
  constraint: string;
  verdict: "pass" | "violation" | "unsure";
  evidence: Array<{ line: number; text: string }>;
};

/*
 * PROPOSED dataset adapter: a dataset directory contains statement.md,
 * constraints.json, and C++ sources below solutions/. The official evaluator
 * layout and error vocabulary remain pending; keeping this adapter separate
 * prevents the checker core from depending on filesystem conventions.
 */
function parseOptions(arguments_: string[]): CliOptions {
  if (arguments_.length !== 4) {
    throw new Error(
      "Usage: leetkob-checker --data <folder> --predictions <file>",
    );
  }

  let data: string | undefined;
  let predictions: string | undefined;
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${flag ?? "argument"}`);
    }
    if (flag === "--data") {
      data = value;
    } else if (flag === "--predictions") {
      predictions = value;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (data === undefined || predictions === undefined) {
    throw new Error("Both --data and --predictions are required");
  }
  return { data, predictions };
}

function readConstraints(path: string): CheckerConstraint[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `Cannot read valid JSON constraints at ${path}: ${message}`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("PROPOSED constraints.json schema must be an array");
  }
  const ids = new Set<string>();
  return parsed.map((item, index) => {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      typeof item.text !== "string" ||
      typeof item.deductionTenths !== "number" ||
      !Number.isInteger(item.deductionTenths)
    ) {
      throw new Error(`Invalid proposed constraint at index ${index}`);
    }
    if (ids.has(item.id)) {
      throw new Error(`Duplicate constraint id: ${item.id}`);
    }
    ids.add(item.id);
    return {
      id: item.id,
      text: item.text,
      deductionTenths: item.deductionTenths,
    };
  });
}

function cppFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...cppFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".cpp")) {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function solutionId(solutionsDirectory: string, file: string): string {
  return relative(solutionsDirectory, file)
    .replaceAll(sep, "/")
    .replace(/\.cpp$/, "");
}

export function readProposedDataset(directory: string): CheckerInput[] {
  const statement = readFileSync(join(directory, "statement.md"), "utf8");
  const constraints = readConstraints(join(directory, "constraints.json"));
  const solutionsDirectory = join(directory, "solutions");
  const inputs = cppFiles(solutionsDirectory).map((file) => ({
    solution: solutionId(solutionsDirectory, file),
    statement,
    source: readFileSync(file, "utf8"),
    constraints,
  }));
  const solutionIds = new Set<string>();
  for (const input of inputs) {
    if (solutionIds.has(input.solution)) {
      throw new Error(`Duplicate solution id: ${input.solution}`);
    }
    solutionIds.add(input.solution);
  }
  return inputs;
}

export function evaluateModelOff(inputs: CheckerInput[]): PredictionRow[] {
  return inputs.flatMap((input) =>
    evaluateHardRules(input).evaluations.map((evaluation) => ({
      solution: input.solution,
      constraint: evaluation.constraintId,
      verdict: evaluation.verdict,
      evidence: evaluation.evidence,
    })),
  );
}

export function runCli(arguments_: string[]): void {
  const options = parseOptions(arguments_);
  if (process.env.MODEL_OFF !== "1") {
    throw new Error(
      "MODEL_OFF=1 is required until the model adapter is integrated",
    );
  }
  const rows = evaluateModelOff(readProposedDataset(options.data));
  writeFileSync(
    options.predictions,
    rows.map((row) => JSON.stringify(row)).join("\n") +
      (rows.length > 0 ? "\n" : ""),
  );
}

try {
  runCli(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`checker: ${message}\n`);
  process.exitCode = 2;
}
