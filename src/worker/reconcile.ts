import type { WorkflowRepository } from "../db/workflow-repository.ts";
import { connectDocker } from "../sandbox/docker.ts";
import type { Engine } from "../sandbox/docker.ts";

/** Operator-only: removes only containers labelled with an already quarantined UUID. */
export async function reconcileSandboxAttempt(
  repo: WorkflowRepository,
  attemptId: string,
  operator: string,
  engine?: Engine,
): Promise<boolean> {
  if (
    !/^[a-f0-9-]{36}$/.test(attemptId) ||
    !repo.listQuarantinedAttempts().some((row) => row.attemptId === attemptId)
  )
    throw new Error("unknown_quarantined_attempt");
  const lease = repo.db
    .prepare(
      "SELECT j.state,j.lease_expires_at FROM jobs j JOIN attempt_safety s ON s.job_id=j.id WHERE s.attempt_id=?",
    )
    .get(attemptId);
  if (lease?.state === "leased" && Number(lease.lease_expires_at) > Date.now())
    throw new Error("active_lease");
  const docker = engine ?? (await connectDocker());
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`leetkob.sandbox.run=${attemptId}`] }),
  );
  const path = `/containers/json?all=true&filters=${filters}`;
  let confirmed: boolean;
  try {
    const rows = await docker.call<{ Id: string }[]>("GET", path);
    if (rows.length > 202) throw new Error("cleanup_bound");
    for (const row of rows) {
      if (!/^[a-f0-9]{12,64}$/.test(row.Id))
        throw new Error("invalid_container_id");
      await docker.call("DELETE", `/containers/${row.Id}?force=true&v=true`);
    }
    confirmed = (await docker.call<{ Id: string }[]>("GET", path)).length === 0;
  } catch {
    confirmed = false;
  }
  repo.reconcileAttemptCleanup(attemptId, {
    confirmed,
    operator,
    now: Date.now(),
  });
  return confirmed;
}
