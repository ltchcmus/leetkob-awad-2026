import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { loadModelRouter } from "../ai/config.ts";
import { checkSubmission } from "./orchestrator.ts";
import type { CheckerConstraint, CheckerInput } from "./hard-rules.ts";

type CliOptions = { data: string; predictions: string };

type PredictionRow = {
  solution: string;
  constraint: string;
  verdict: "pass" | "violation" | "unsure";
  evidence: Array<{ line: number; text: string }>;
};

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

function readConstraints(path: string, official: boolean): CheckerConstraint[] {
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
      typeof item.text !== "string"
    ) {
      throw new Error(`Invalid proposed constraint at index ${index}`);
    }
    const deduction = official ? item.deduction : item.deductionTenths;
    const deductionTenths =
      typeof deduction === "number"
        ? official
          ? deduction * 10
          : deduction
        : NaN;
    if (!Number.isSafeInteger(deductionTenths)) {
      throw new Error(`Invalid deduction at index ${index}`);
    }
    if (ids.has(item.id)) {
      throw new Error(`Duplicate constraint id: ${item.id}`);
    }
    ids.add(item.id);
    return {
      id: item.id,
      text: item.text,
      deductionTenths,
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

type DatasetInput = CheckerInput & { labId: string };

function readProblem(
  problemDirectory: string,
  solutionsDirectory: string,
  labId: string,
  official: boolean,
): DatasetInput[] {
  const statement = readFileSync(
    join(problemDirectory, "statement.md"),
    "utf8",
  );
  const constraints = readConstraints(
    join(problemDirectory, "constraints.json"),
    official,
  );
  return cppFiles(solutionsDirectory).map((file) => ({
    labId,
    solution:
      (official ? labId + "/" : "") + solutionId(solutionsDirectory, file),
    statement,
    source: readFileSync(file, "utf8"),
    constraints,
  }));
}

export function readDataset(directory: string): DatasetInput[] {
  const problems = join(directory, "problems");
  const solutions = join(directory, "solutions");
  const inputs = existsSync(problems)
    ? readdirSync(problems, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .flatMap((id) =>
          readProblem(join(problems, id), join(solutions, id), id, true),
        )
    : readProblem(directory, solutions, "dataset", false);
  const solutionIds = new Set<string>();
  for (const input of inputs) {
    if (solutionIds.has(input.solution)) {
      throw new Error(`Duplicate solution id: ${input.solution}`);
    }
    solutionIds.add(input.solution);
  }
  return inputs;
}

export async function runCli(arguments_: string[]): Promise<void> {
  const options = parseOptions(arguments_);
  const router = loadModelRouter(process.env, {
    write: (entry) => process.stderr.write(JSON.stringify(entry) + "\n"),
  });
  const rows: PredictionRow[] = [];
  for (const input of readDataset(options.data)) {
    const checked = await checkSubmission(input, router);
    rows.push(
      ...checked.evaluations.map((evaluation) => ({
        solution: input.solution,
        constraint: evaluation.constraintId,
        verdict: evaluation.verdict,
        evidence: evaluation.evidence,
      })),
    );
  }
  writeFileSync(
    options.predictions,
    rows.map((row) => JSON.stringify(row)).join("\n") +
      (rows.length > 0 ? "\n" : ""),
  );
}

if (import.meta.main) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stderr.write(`checker: ${message}\n`);
    process.exitCode = 2;
  }
}
