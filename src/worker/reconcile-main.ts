import { existsSync } from "node:fs";
import { WorkflowRepository } from "../db/workflow-repository.ts";
import { reconcileSandboxAttempt } from "./reconcile.ts";

const path = process.env.DATABASE_PATH;
if (!path || !existsSync(path))
  throw new Error("An existing persistent database is required");
const repo = new WorkflowRepository(path);
try {
  if (process.argv[2] === "--list")
    console.info(JSON.stringify(repo.listQuarantinedAttempts()));
  else {
    const attemptId = process.argv[2];
    const operator = process.argv[3];
    if (!attemptId || !operator)
      throw new Error(
        "Usage: reconcile-main.ts <attempt UUID> <operator ID>, or --list",
      );
    const confirmed = await reconcileSandboxAttempt(repo, attemptId, operator);
    console.info(JSON.stringify({ attemptId, cleanupConfirmed: confirmed }));
    if (!confirmed) process.exitCode = 1;
  }
} finally {
  repo.close();
}
