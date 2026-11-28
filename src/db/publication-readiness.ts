import type { DatabaseSync } from "node:sqlite";
import { Problem } from "../problem.ts";

export function assertWorkflowReady(db: DatabaseSync, labId: number): void {
  const incomplete = db
    .prepare(
      `
    SELECT 1 FROM counted_heads h JOIN submissions s ON s.id = h.submission_id
    LEFT JOIN jobs j ON j.submission_id = s.id
    WHERE s.lab_id = ? AND (
      j.id IS NULL OR j.state <> 'completed' OR s.review_initialized <> 1
      OR s.checker_status NOT IN ('complete','not_required')
      OR (s.judge_status = 'AC' AND (
        NOT EXISTS (SELECT 1 FROM verdict_sets v WHERE v.submission_id = s.id)
        OR (SELECT COUNT(*) FROM verdicts v WHERE v.submission_id = s.id)
          <> (SELECT json_array_length(payload,'$.constraints') FROM submission_snapshots WHERE submission_id=s.id)
        OR (SELECT COUNT(*) FROM reviews r WHERE r.submission_id = s.id)
          <> (SELECT json_array_length(payload,'$.constraints') FROM submission_snapshots WHERE submission_id=s.id)
        OR (SELECT COUNT(*) FROM review_items r WHERE r.submission_id = s.counted_id)
          <> (SELECT json_array_length(payload,'$.constraints') FROM submission_snapshots WHERE submission_id=s.id)
        OR EXISTS (SELECT 1 FROM reviews r WHERE r.submission_id = s.id AND r.decision IS NULL)
      ))
    ) LIMIT 1
  `,
    )
    .get(labId);
  if (incomplete) throw new Problem("reviews-pending");
}
