import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadModelRouter } from "./config.ts";
import { readDataset } from "../checker/cli.ts";
import { checkSubmission } from "../checker/orchestrator.ts";

const [dataset, output] = process.argv.slice(2);
if (!dataset || !output)
  throw new Error("Provide dataset and existing output directory");
const predictions = join(output, "predictions.jsonl");
const log = join(output, "call-log.jsonl");
const inputs = readDataset(dataset);
const expected = new Set(
  inputs.flatMap((input) =>
    input.constraints.map((c) => input.solution + "/" + c.id),
  ),
);
const completed = new Set<string>();
if (existsSync(predictions)) {
  for (const line of readFileSync(predictions, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)) {
    const row = JSON.parse(line) as { solution: string; constraint: string };
    const key = row.solution + "/" + row.constraint;
    if (!expected.has(key) || completed.has(key))
      throw new Error("Unknown or duplicate persisted prediction");
    completed.add(key);
  }
}
let quota = false;
let current = "";
const router = loadModelRouter(process.env, {
  write(entry) {
    appendFileSync(
      log,
      JSON.stringify({
        ...entry,
        timestamp: new Date().toISOString(),
        solution: current,
      }) + "\n",
    );
    if (entry.outcome === "rate_limit") quota = true;
  },
});
let processed = 0;
for (const input of inputs) {
  const pending = input.constraints.filter(
    (c) => !completed.has(input.solution + "/" + c.id),
  );
  if (!pending.length) continue;
  current = input.solution;
  const result = await checkSubmission(
    { ...input, constraints: pending },
    router,
  );
  const blocked = result.evaluations.some(
    (row) =>
      row.reason === "quota" ||
      row.reason === "budget" ||
      row.reason === "unconfigured",
  );
  if (quota || blocked) break;
  for (const row of result.evaluations) {
    appendFileSync(
      predictions,
      JSON.stringify({
        solution: input.solution,
        constraint: row.constraintId,
        verdict: row.verdict,
        evidence: row.evidence,
      }) + "\n",
    );
  }
  processed++;
  await new Promise((resolve) => setTimeout(resolve, 6500));
}
writeFileSync(
  join(output, "progress.json"),
  JSON.stringify(
    { processedThisProcess: processed, quotaStopped: quota },
    null,
    2,
  ) + "\n",
);
