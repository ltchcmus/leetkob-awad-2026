# Sandbox test design and commands

Status: **test-first proposal**. Fixtures and assertions exist; a runner and judge
image do not. A passing harness self-test is not proof that C++ attacks were blocked.

Use Node 24.11.0. Existing `npm test` selects only `test/*.test.ts`; it does **not**
include these nested tests. No existing check or workflow has been changed.

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.11.0
node --test --test-concurrency=1 test/sandbox/harness.test.ts
node --test --test-concurrency=1 test/sandbox/sandbox.contract.test.ts
```

The second command must currently exit 1 with explicit missing-runner failures.
It does not skip tests or return fake verdicts. Missing Docker/image/opt-in are also
failures, not successful attacks. No C++ is compiled or executed in this state.

After a reviewed implementation and image exist, real execution requires explicit
trusted configuration (replace the digest with an actual built image):

```powershell
$env:SANDBOX_RUN_ATTACKS = '1'
$env:SANDBOX_JUDGE_IMAGE = 'judge@sha256:<actual-digest>'
node --test --test-concurrency=1 test/sandbox/sandbox.contract.test.ts
```

Never run fixtures with a host C++ compiler. Never demonstrate weak network/root/
secret/mount configurations on a public host. Assertions are not weakened to get green.

## Harness and safety envelope

The harness checks the runner exists **before** launching anything. Each actual case
uses a separate trusted Node process; it imports the future `runInSandbox` adapter.
The parent limits protocol output to 128 KiB and kills the child process tree after
30 seconds (a POSIX process group, or bounded Windows taskkill /T).
The adapter supplies an abort signal at 25 seconds. Each Node test allows 60 seconds
for startup, timeout and cleanup; cases run sequentially. Proposed CI job timeout is
15 minutes for 13 cases plus image build; actual CI integration remains future work.

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
container was defeated. Real red/green mutation evidence remains pending. Never run
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

The current branch does not claim M1-M9, a worker or CI security gates are complete.
Host capacity, production probes, worker integration and owner ACKs remain pending.

## Local verification record

21 November 2026, Node 24.11.0, Windows development host:

| Command                                                                  | Exit | Observation                                                 |
| ------------------------------------------------------------------------ | ---- | ----------------------------------------------------------- |
| `npm run lint`                                                           | 0    | Includes new TypeScript files                               |
| `npm run format:check`                                                   | 0    | Includes new technical documentation                        |
| `npm run typecheck`                                                      | 0    | Proposed types and test harness compile                     |
| `npm test`                                                               | 0    | Existing 26 tests pass; sandbox files are outside this glob |
| `node --test --test-concurrency=1 test/sandbox/harness.test.ts`          | 0    | 16 harness/oracle tests pass; no C++ execution              |
| `node --test --test-concurrency=1 test/sandbox/sandbox.contract.test.ts` | 1    | 13 expected RED tests: runner.ts absent; no C++ execution   |

No judge image was built, container attack executed, worker integrated or CI run
published for this change. Existing Docker readiness is a prerequisite, not a substitute
for the pending real attack results. This record is not a claim that security CI passes.
