import type { ConstraintResult } from "./types.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validateModel(
  text: string,
  ids: readonly string[],
  original: readonly string[],
  visible: readonly string[],
):
  | { results: ConstraintResult[] }
  | { reason: "invalid_schema" | "invalid_evidence" } {
  const schema = { reason: "invalid_schema" } as const;
  const invalidEvidence = { reason: "invalid_evidence" } as const;
  if (text.length > 128_000) return schema;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return schema;
  }
  if (!Array.isArray(raw) || raw.length !== ids.length) return schema;
  const remaining = new Set(ids);
  const results = new Map<string, ConstraintResult>();
  for (const row of raw as unknown[]) {
    if (
      !record(row) ||
      Object.keys(row).length !== 3 ||
      typeof row.constraintId !== "string" ||
      !remaining.delete(row.constraintId) ||
      (row.verdict !== "pass" &&
        row.verdict !== "violation" &&
        row.verdict !== "unsure") ||
      !Array.isArray(row.evidence) ||
      row.evidence.length > 16
    )
      return schema;
    if (row.verdict === "violation" && !row.evidence.length)
      return invalidEvidence;
    const evidence: ConstraintResult["evidence"] = [];
    for (const entry of row.evidence as unknown[]) {
      if (
        !record(entry) ||
        Object.keys(entry).length !== 2 ||
        typeof entry.line !== "number" ||
        !Number.isSafeInteger(entry.line) ||
        typeof entry.text !== "string"
      )
        return schema;
      const index = entry.line - 1;
      if (
        !entry.text.trim() ||
        entry.text !== visible[index] ||
        entry.text !== original[index]
      )
        return invalidEvidence;
      evidence.push({ line: entry.line, text: entry.text });
    }
    results.set(row.constraintId, {
      constraintId: row.constraintId,
      verdict: row.verdict,
      source: "model",
      evidence,
    });
  }
  return { results: ids.map((id) => results.get(id)!) };
}
