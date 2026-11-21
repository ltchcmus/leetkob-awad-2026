# Worker to sandbox integration

Sandbox owner: Công. Worker/queue/review owner: Thịnh. This module performs no API,
authentication, database, lease, scoring, constraint-checker or publication operations.
PR #15's API/worker decisions remain separate. Production VPS and hosted CI runs are
not verified by a successful local container test.

## Build and call

Use Node 24.11.0 and a local Linux Docker daemon (Unix socket on VPS, named pipe
through Docker Desktop on Windows). The trusted controller needs Docker access;
untrusted containers never receive the socket. Docker Engine API v1.45 is used.
[Docker API reference](https://docs.docker.com/reference/api/engine/version/v1.45/)

```powershell
docker build --provenance=false --tag leetkob-judge:sandbox-v1 --file Dockerfile.judge judge
$env:SANDBOX_JUDGE_IMAGE = docker image inspect leetkob-judge:sandbox-v1 --format '{{index .RepoDigests 0}}'
if ($LASTEXITCODE -ne 0) { throw 'Judge image preflight failed' }
node src/sandbox/example.ts
```

The build context is **judge/**, not the repository root. The pinned Debian base
installs compiler/Python at image build time. Runtime has no network or package
installation. `--provenance=false` gives a single executable manifest digest; record
the actual resolved digest for each approved release. Do not substitute the image
config ID or a mutable tag for a manifest digest. The Docker API requires the image
already present and never implicitly pulls it during a student job.

[example.ts](../../src/sandbox/example.ts) is an actual executable caller for synthetic
C++ addition. Its real response can be saved for audit. It reads the reference safety
profile from [policy.json](../../judge/policy.json); these are container limits, not a
VPS capacity recommendation. Worker concurrency and host headroom must be benchmarked.

```ts
import { createHash, randomUUID } from "node:crypto";
import { runInSandbox } from "../../src/sandbox/runner.ts";
import type { SandboxPolicy } from "../../src/sandbox/contract.ts";

// trustedPolicy comes from operator configuration, never the submission HTTP body.
declare const trustedPolicy: SandboxPolicy;
const source = "int main(){return 0;}\n";
const abort = new AbortController();
const result = await runInSandbox(
  {
    submissionId: "opaque-submission-id",
    source: {
      text: source,
      sha256: createHash("sha256").update(source, "utf8").digest("hex"),
    },
    tests: [{ id: "case-1", input: "", expectedOutput: "" }],
  },
  trustedPolicy,
  { runId: randomUUID(), signal: abort.signal },
);
```

The worker must load and preserve one immutable source/test snapshot per job version.
Use a new UUID per attempt, including retries; never reuse a live attempt's run UUID.
Unknown request/policy fields are rejected. Submission/test IDs are correlation data
and are never interpolated into executable names, host paths, shell code or mounts.
No arbitrary compiler flags, image, environment or Docker flags are accepted from
the student. Runtime input is UTF-8; SHA-256 covers original UTF-8 source bytes without
normalizing line endings.

## Response and persistence

`kind=completed` contains submission/hash/policy correlation, compile result, ordered
per-test prefix, final judgeStatus, allowlisted actual inspect evidence and cleanup.
The six judge statuses are AC, WA, TLE, MLE, RE and CE. Queued/running are worker
lifecycle states. Only AC may proceed to the hard-rule/semantic checker pipeline;
this module never calls either checker itself.

Compiler resources are bounded independently of runtime resources. CPU/wall/OOM map
to TLE/TLE/MLE in either phase; ordinary compilation errors map to CE. Program nonzero
exit/signal and output overflow map to RE, with a distinguishable reason. Compiler
output overflow maps to CE/output_limit. Expected outputs are compared token by token
in the trusted controller. Every test receives a fresh container/executable/workspace;
one test cannot rewrite later tests' executable or expected output.

Persist exactly one accepted verdict set for the immutable job version inside the
worker's transaction/lease protocol. A second successful attempt must not overwrite
an already committed result. This is a worker guarantee; the sandbox writes no DB.
Raw bounded stdout/stderr remain untrusted content. Do not forward them automatically
to students or render as HTML. Environment values, Docker errors and host paths are
not included in infrastructure errors or inspect evidence.

## Retry and cancellation

Handle `kind=infrastructure_error` separately from student verdicts:

| Code                                                           | Worker action                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| daemon_unavailable, container_start_failed, controller_timeout | Bounded retry/backoff only when retryable=true and cleanup.succeeded=true  |
| image_unavailable, compiler_unavailable, invalid_policy        | Operator repair; no student CE/RE                                          |
| invalid_request                                                | Investigate snapshot/admission mismatch; no automatic retry                |
| cancelled                                                      | Do not finalize a student verdict; worker owns lease/shutdown rescheduling |
| measurement_unavailable, controller_error                      | Investigate controller; do not manufacture a grade                         |
| cleanup_failed                                                 | Quarantine capacity, no automatic retry; resolve possible live containers  |

Call `abort.abort()` during shutdown or lease loss. The runner kills/removes the whole
container, including descendants, before returning cancellation when Docker is healthy.
An AbortSignal already aborted causes no container creation. Do not release capacity
merely because an HTTP request disconnected; wait for cleanup and transaction rules.

A detached trusted watchdog is armed for each created container. If the worker process
dies, it removes even stopped orphan containers by the phase wall time plus 8 seconds
for startup/observation. The ordinary live controller applies the stricter phase wall
deadline. The watchdog retries removal three times with bounded Docker requests.
Docker/host failure can prevent removal; failed cleanup is never reported as successful.
On restart, reconcile leased attempts with their recorded UUIDs before rescheduling.
Scope recovery to known owned UUID labels; never prune unrelated containers/images.

## Evidence and remaining integration decisions

Local test-first commit: `ca5690b3e695abeb50bd9096bc654dda7890dd99` (13 RED before runner).
The original attack fixtures/assertions are unchanged. The current real suite covers
all M1-M9 plus AC/WA/CE; additional tests cover ordered aggregation, pristine state,
RE, compiler limits, cancellation and crash cleanup. Fake-daemon tests cover admission,
missing image, failed create and cleanup uncertainty without networking to a provider.

The separate [sandbox workflow](../../.github/workflows/sandbox.yml) runs on PRs to
main, configured branch pushes and the pa3 tag. It builds the same image definition,
resolves a digest, runs PA2 checks and all sandbox tests sequentially, without model
secrets. It fails if labeled containers remain. The workflow is configured locally;
an actual hosted run URL requires an authorized push. No such run is claimed here.

Thịnh review requested: source/test version mapping, transaction/idempotency behavior,
attempt UUID/lease ownership, cancellation/rescheduling and persistence adapter.
Hậu review requested only where API snapshot IDs/admission or status representation
meet this boundary. No API/queue implementation has been changed by this module.
VPS probes, host capacity and CI run for the release tag remain outstanding.
