# Sandbox test design and commands

Status: **implemented, local Docker tests executed**. Harness/oracle tests remain
distinct from real C++ attack execution. Hosted CI and production probes are pending.

Use Node 24.11.0. Existing `npm test` selects only `test/*.test.ts`; it does **not**
include these nested tests. A separate sandbox workflow invokes all nested suites.
The existing quality workflow and PA2 tests remain unchanged.

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.11.0
docker build --provenance=false --tag leetkob-judge:sandbox-v1 --file Dockerfile.judge judge
$env:SANDBOX_JUDGE_IMAGE = docker image inspect leetkob-judge:sandbox-v1 --format '{{index .RepoDigests 0}}'
if ($LASTEXITCODE -ne 0) { throw 'Judge image preflight failed' }
$env:SANDBOX_RUN_ATTACKS = '1'
node --test --test-concurrency=1 --test-reporter=spec test/sandbox/*.test.ts
```

Missing Docker/image/opt-in are failures, never successful attack results. Build context
is only judge/, additionally allowlisted by its .dockerignore. No repository environment
file, student program or model key enters the image build context.

For an already built approved digest, real execution still requires explicit trusted
configuration (replace the placeholder with the actual digest):

```powershell
$env:SANDBOX_RUN_ATTACKS = '1'
$env:SANDBOX_JUDGE_IMAGE = 'judge@sha256:<actual-digest>'
node --test --test-concurrency=1 test/sandbox/sandbox.contract.test.ts
```

Never run fixtures with a host C++ compiler. Never demonstrate weak network/root/
secret/mount configurations on a public host. Assertions are not weakened to get green.

## Harness and safety envelope

The harness checks the runner exists **before** launching anything. Each actual case
uses a separate trusted Node process; it imports the `runInSandbox` adapter.
The parent limits protocol output to 128 KiB and kills the child process tree after
30 seconds (a POSIX process group, or bounded Windows taskkill /T).
The adapter supplies an abort signal at 25 seconds. Each Node test allows 60 seconds
for startup, timeout and cleanup; cases run sequentially. The sandbox CI job timeout is
15 minutes, including image build, PA2 checks and the sandbox suites.

On success or failure after dispatch, the parent independently checks Docker for all
containers bearing its random run UUID, then force-removes only those IDs in `finally`.
Docker inspection/cleanup commands each have a 5-second timeout and bounded capture.
Runner children may not leak helper processes or create unlabeled containers; these
are implementation acceptance requirements. An external CI job timeout is the last
backstop, not a replacement for runner watchdog/cleanup. Run on an isolated Linux
runner, with bounded job concurrency and no model credentials.

The checking process inherits only OS/Docker plumbing and injects **public fake
canaries** for provider environment variable names. Real provider values are never
copied. The future controller must not forward even these canaries to containers.
Assertions reject their appearance in compile/runtime output and reject nonallowlisted
container environment names. The compiler include fixture reports accessible secret
paths without printing file contents.

Current proposed test profile (not production configuration): compile 5 CPU seconds,
10 seconds wall, 512 MiB RAM/no swap, 32 pids, 8192 output bytes; each run 1 CPU second,
5 seconds wall, 64 MiB RAM/no swap, 16 pids, 4096 output bytes; private workspace 32 MiB.
M3 shortens run wall time to 500 ms. CPU quota is 1 in addition to the CPU-time budget.
The parent watchdog is independent of all these runner-supplied limits.

## Test matrix

All rows require source hash/IDs/policy correlation, actual compile and run isolation
evidence, bounded output/measurements, successful cleanup, and no surviving labeled
containers. Inspect evidence is supplementary: each row also checks fixture behavior.

| Row / fixture               | Required behavior                                                                  | Weak outcome rejected                                                         |
| --------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AC / valid.cpp              | Input `2 3` produces `5`; AC                                                       | Wrong output or unconditional error                                           |
| WA / valid.cpp              | Expected `6` gives WA while program outputs `5`                                    | Unconditional AC; missing trusted comparator                                  |
| CE / compile-error.cpp      | CE with diagnostics; no run phase                                                  | Compiler missing treated as student CE, or execution attempted                |
| M1 / m1-network.cpp         | Nonblocking numeric connect fails immediately with no-route errno; AC sentinel     | Connected/EINPROGRESS/unrelated socket errors; DNS/timeout alone              |
| M2 / m2-cpu.cpp             | Volatile loop consumes CPU budget; TLE/cpu_time before wall limit                  | Only CPU quota or wall watchdog                                               |
| M3 / m3-wall.cpp            | Parent starts sleeping child; TLE/wall_clock, whole container removed              | Killing only parent; missing child marker; surviving container                |
| M4 / m4-memory.cpp          | Touch/read 192 MiB against 64 MiB limit; MLE with verified OOM                     | Optimized-away allocation, pre-touch malloc failure, memory readback succeeds |
| M5 / m5-pids.cpp            | Bounded 80-fork loop reaches EAGAIN below 16 pids; some forks succeed, all reaped  | Blanket fork denial, all 80 forks, wrong errno, children unreaped             |
| M6 / m6-output.cpp          | Attempt up to 32 MiB; RE/output_limit; retain exactly 4096 bytes, truncated        | Full capture, worker stall, false truncation, WA                              |
| M7 / m7-user.cpp            | Nonzero uid/euid, setuid(0) denied, no effective caps, no-new-privileges           | Root, escalation or retained capabilities                                     |
| M8 / m8-host.cpp            | No socket; cannot write host-like expected-output path; inspect has no bind/volume | Socket or writable host mount; flags-only assertion                           |
| M9 runtime / m9-runtime.cpp | Provider env variables and known secret file paths absent                          | Controller environment forwarded or secret file visible                       |
| M9 compile / m9-compile.cpp | `__has_include` cannot see secret paths; successful isolated compile/run           | File visible to compiler even when runtime env is clean                       |

`harness.test.ts` exercises actual trusted-child success, timeout and output bounding.
It also feeds synthetic safe/weak results to the assertion oracle for every M row,
plus cleanup and infrastructure-failure negative controls. These modeled controls
prove the assertions reject those inputs; they do not prove an actual vulnerable
container was defeated. Two bounded real CPU/memory negative controls now reject weakened limits; other weak-configuration mutations remain pending. Never run
a network-enabled, privileged, host-mounted or genuinely secret-bearing weak variant.

## Implementation acceptance beyond individual rows

- Fail fast on invalid snapshots/policies before container creation; distinguish
  Docker/image/compiler availability failures from CE.
- Test compile CPU/wall/OOM/output paths too, multi-test prefix/aggregation and a
  complete all-AC run. The initial adversarial fixtures primarily exercise runtime.
- Test actual daemon/start/abort/cleanup failure handling with fake Docker transport
  before using real containers; tests must never fabricate production verdicts.
- Test disconnect/worker-crash orphan recovery, runner restarts and label cleanup races.
- Verify original expected outputs cannot be modified by submitted code or previous tests.
- Record real image digest, policy version, exit codes, bounded logs and Linux CI run
  on the submission tag. Production VPS execution must be verified separately.

The real M1-M9 suite has passed locally. Worker integration, hosted CI/tag evidence,
production probes and host capacity verification remain pending. Extra integration tests
cover compiler CPU/wall/memory/output, fresh test state, ordered aggregation, runtime
errors, cancellation and cleanup after a trusted worker process crash.

## Historical test-first checkpoint

Commit ca5690b3e695abeb50bd9096bc654dda7890dd99, 21 November 2026,
Node 24.11.0, before runner/image implementation:

| Command                                                                  | Exit | Observation                                                 |
| ------------------------------------------------------------------------ | ---- | ----------------------------------------------------------- |
| `npm run lint`                                                           | 0    | Includes new TypeScript files                               |
| `npm run format:check`                                                   | 0    | Includes new technical documentation                        |
| `npm run typecheck`                                                      | 0    | Proposed types and test harness compile                     |
| `npm test`                                                               | 0    | Existing 26 tests pass; sandbox files are outside this glob |
| `node --test --test-concurrency=1 test/sandbox/harness.test.ts`          | 0    | 16 harness/oracle tests pass; no C++ execution              |
| `node --test --test-concurrency=1 test/sandbox/sandbox.contract.test.ts` | 1    | 13 expected RED tests: runner.ts absent; no C++ execution   |

At that checkpoint no judge image or runner existed and no C++ was executed. Its
13 RED results remain in history; assertions/fixtures were not weakened to turn them
green. Current execution evidence is recorded separately.

## Current local implementation evidence

21 November 2026: npm ci and all four quality checks exit 0; PA2 26/26 PASS.
The complete sandbox command exits 0 with 47/47 PASS, 0 skipped: 16 harness/oracle,
7 admission/infrastructure, 11 extra real integration and 13 original attack/control tests.
The real caller example exits 0 with AC and verified cleanup. No labeled containers remain.

- [Verification metadata and source hashes](evidence/local-verification.json)
- [Actual complete sandbox test output](evidence/local-sandbox-tests.txt)
- [Actual worker example response](evidence/worker-example.json)

The tests include actual bounded weakened CPU/memory controls; no weak network/root/
mount/socket/secret configuration was executed. Source fixtures and assertions from
the test-first commit remain unchanged. A fake-daemon test exposed and verified the
repair of create-failure mapping. The worker-crash observer was corrected to await
actual execution before terminating the worker; its exit-77 expectation was preserved.

A Docker Desktop tag/digest lookup inconsistency was observed after an attested build.
A single-manifest rebuild with --provenance=false resolved lookup during final checks;
this is an observation, not a diagnosis of Docker internals. Hosted CI and VPS are
still pending; local results must not be represented as a GitHub run or production proof.
