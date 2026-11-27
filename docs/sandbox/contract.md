# Sandbox boundary

Status: **implemented and tested locally**. Sandbox owner: Công. Worker/API integration
review remains with Thịnh/Hậu. A judge image and real Docker M1-M9 tests exist;
hosted CI and production VPS verification remain pending. The PA2 contract is unchanged.

The TypeScript boundary is [contract.ts](../../src/sandbox/contract.ts).
[runner.ts](../../src/sandbox/runner.ts) exports `runInSandbox(request, policy, context)`.
The worker is a separate trusted process from the HTTP API; submitted C++ is never
run on the host. The sandbox cannot call the checker, model, database or publication endpoint.

## Inputs and authority

`SandboxRequest` contains the immutable source bytes and SHA-256 plus ordered test
snapshots. SHA-256 is over the exact UTF-8 bytes, including original line endings.
Submission IDs are correlation data, never filesystem paths or executable names.
The worker must retain the corresponding source and lab/test version for a retry.
All tests must have unique IDs; an empty test list or hash mismatch is invalid.

The trusted controller supplies `SandboxPolicy` independently of submitted input:

- Image must be pinned by digest. The student cannot choose image or runtime.
- The only proposed compiler profile is `cpp17-o2`: fixed argument array using
  `g++ -std=c++17 -O2`, fixed internal filenames, no shell interpolation or user flags.
- Compile and each test have distinct CPU-time, wall-time, RAM, process and output
  limits. Memory+swap equals memory: no sandbox swap allowance.
- `cpuTimeMs` is aggregate CPU consumption of the process tree, not the CPU rate
  quota. Compiler CPU limits must include compiler subprocesses too.
- The writable workspace is a bounded private tmpfs. No host source/test/DB binds,
  volumes, Docker socket, privileged mode or model environment enters the sandbox.
- Root filesystem is read-only; UID/GID 65534; capabilities dropped;
  no-new-privileges; no network. Environment is explicitly allowlisted. No model
  key is used during image build, compile, execution or cleanup.

Source and inputs use a bounded stream or archive transported by the trusted
controller, never a host bind mount. Expected output stays outside the submitted
program's writable workspace. The executable remains inside the isolated lifecycle;
it is never copied to the host for execution. Whether one container with controlled
phases or multiple isolated containers are used remains an implementation choice;
the phase-specific limits and artifact isolation must hold either way.

Readonly TypeScript types document the boundary. The runner also validates and copies
inputs/policy before creating containers, rejecting unknown executable configuration.
Sandbox admission bounds: source <= 1 MiB,
1..100 tests, total input+expected-output <= 4 MiB; these are pending owner ACK and
are distinct from API HTTP limits. Limits are finite positive integers, except CPU
quota which is positive finite. Configuration is never silently relaxed.

## Completed results and aggregation

`completed` means judging finished with valid measurements and successful cleanup;
it is not a published mark or a constraint verdict. `queued` and `running` belong to
the worker lifecycle, not `JudgeStatus`.

Compile success is represented by `compile.status=AC`, `reason=ok`; this alone does
not imply the submission is AC. Ordinary compiler diagnostics/nonzero exit map to
CE. A compile CPU/wall timeout maps to TLE and compile OOM to MLE, with phase evidence.
No tests run after compilation fails. Compiler output overflow maps to CE with
`reason=output_limit`. These compile resource mappings require Thịnh/Hậu ACK.

For successful compilation, run tests sequentially in declared order; stop at the
first non-AC test. Completed tests form an ordered prefix with matching test IDs.
The overall verdict is that first failing test's status, or AC if every test passes.
Compare output token by token, ignoring whitespace, in the trusted controller.
Each test starts from the pristine compiled artifact and fresh writable state;
writes by one test cannot change the executable or inputs of a subsequent test.

| Event                        | Verdict / reason         |
| ---------------------------- | ------------------------ |
| Exit 0, tokens match         | AC / ok                  |
| Exit 0, tokens differ        | WA / wrong_answer        |
| CPU budget reached           | TLE / cpu_time           |
| Wall deadline reached        | TLE / wall_clock         |
| Verified container OOM event | MLE / memory             |
| Output cap exceeded          | RE / output_limit        |
| Other signal or nonzero exit | RE / signal or exit_code |

Output overflow is proposed as RE because this boundary has no OLE status; ACK is
required. It must be distinguishable using `reason`, never misreported as WA.
When terminal events race, use observed event times; if not distinguishable, prefer
verified OOM, then output limit, then CPU, then wall deadline. Do not infer OOM solely
from exit 137, or CPU exhaustion solely from elapsed wall time.

Combined stdout+stderr capture is bounded **while streaming**, including compiler
diagnostics; drain/discard safely and kill the container on overflow. Report retained
UTF-8 bytes without expanding a truncated code point, a truncation flag, CPU time,
wall time and peak memory. No unbounded Docker log spool is allowed. Raw diagnostics
remain internal, bounded, and are not automatically returned to students or public CI.

The wall watchdog/abort kills and removes the entire container lifecycle, including
descendants. The runner labels **every** created container with the
trusted UUID `leetkob.sandbox.run=<context.runId>`. This includes compile containers
and containers created before a start failure. The test harness independently queries
Docker for this label and removes only those containers in `finally`.

## Infrastructure errors and cleanup

`infrastructure_error` never produces AC/WA/TLE/MLE/RE/CE or advances the worker to
a successful final result. It contains a stable safe code, retryability and cleanup
report, not an error stack, command, environment, database path or secret.

| Code                                       | Retry proposal                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| invalid_request, invalid_policy            | false; fix trusted admission/configuration                                    |
| daemon_unavailable, container_start_failed | true after successful cleanup; bounded worker backoff                         |
| image_unavailable, compiler_unavailable    | false; operator must supply a valid approved image                            |
| controller_timeout                         | true after successful cleanup; never confuse with a measured sandbox wall TLE |
| cancelled                                  | false for this attempt; lease/shutdown recovery belongs to worker             |
| measurement_unavailable                    | false; cannot manufacture a student verdict                                   |
| controller_error                           | false; operator investigates an unexpected controller failure                 |
| cleanup_failed                             | false; quarantine runner capacity and alert operator                          |

No cleanup success may be claimed when Docker cannot verify removal. Cleanup failure
overrides an otherwise completed verdict. Never retry before resolving a potentially
live old container. Retry bounds, leases and exactly-one stored verdict set remain
Thịnh's responsibility; this module does not mutate the database.

## Decisions for ACK

1. Hậu/Thịnh: immutable source/test/version identity and admission bounds.
2. Thịnh: completed vs infrastructure union, abort/retry/cleanup and worker lifecycle.
3. Hậu/Thịnh: per-test prefix aggregation, token comparison, compile resource mapping
   and RE/output_limit mapping.
4. Công/Thịnh: separate trusted policy owner and phase-specific limits; test values
   are not production sizing choices.
5. Công: image digest, measurements and safe transport details in implementation.

Only sandbox scope is proposed here. No changes to PR #15, API status DTOs,
queue schema, hard rules, model adapter or PA2 behavior are implied by these types.

## Implementation notes

Docker Engine API v1.45 over the local Unix socket or Windows named pipe creates
containers. The socket remains in the trusted controller and is never mounted.
Remote TCP/SSH Docker endpoints are deliberately unsupported by this transport.
Actual inspect values are checked before the controller starts a container.

An isolated Python transport helper writes source in private tmpfs, invokes the fixed
compiler and streams a size-bounded executable back through memory. It does not execute
the executable on the host. A fresh run container receives that executable and input;
the helper replaces itself with the submitted program. Expected outputs stay trusted.
Compiler diagnostics and program output are streamed with separate artifact framing;
no metadata from submitted stdout is treated as a trusted verdict.

CPU is sampled from Docker's aggregate cgroup counter and enforced by the host, with
per-process RLIMIT_CPU as a fallback. This includes compiler/program descendants.
Memory and swap use hard cgroup limits. `memoryPeakBytes` is the maximum observed
Docker memory sample (or the kernel maximum when supplied), not an exact profiler;
short-lived allocations can occur between samples. Container OOM evidence determines MLE.

The live controller enforces the phase wall deadline. A detached trusted Node watchdog
also force-removes a container if the worker crashes: its backstop deadline is phase
wall time plus 8 seconds for startup/observation. This backstop is not the normal TLE
deadline. If Docker is unavailable, removal cannot be guaranteed; cleanup failure must
quarantine capacity and prevent automatic retry. No system can claim cleanup success
through a daemon outage. See [worker integration](worker-integration.md).
