# Local verification of durable storage and worker

Verified source commit: `6a2b0555ca0e82ca1c6eff900d5e6a389732c81a`.
Date: 21 November 2026. Runtime: Node 24.11.0, portable Windows x64 executable
verified against the official release SHA-256. Dependency install: `npm ci`, exit 0.

| Check                                 | Result                                                  | Evidence                                                                               |
| ------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Lint                                  | exit 0                                                  | Project `npm run lint`                                                                 |
| Formatting                            | exit 0                                                  | Project `npm run format:check`                                                         |
| Type checking                         | exit 0                                                  | Project `npm run typecheck`                                                            |
| Tests                                 | exit 0; 65 pass, 0 fail/skip                            | [Full run](final-tests.txt)                                                            |
| PA2 compatibility                     | All 26 existing tests pass unchanged                    | Same full run                                                                          |
| Storage regressions                   | 21 pass                                                 | `test/queue.persistence.test.ts`                                                       |
| Worker orchestration/process recovery | 10 pass                                                 | `test/worker.pipeline.test.ts`, `test/worker.process.test.ts`                          |
| Direct HTTP Publish gates             | 5 pass                                                  | `test/integration/publish-readiness.ts`                                                |
| Evaluation-data validators            | 3 pass                                                  | `test/eval-cases.test.ts`                                                              |
| Official data bytes                   | 128 files verified at published commit `552c811`        | `test/eval-cases/official-manifest.json`; verifier run on downloaded original snapshot |
| History secret scan                   | Gitleaks 8.30.1, exit 0, 36 commit patches, no findings | [Redacted log](history-scan.txt)                                                       |
| Tracked-source secret scan            | Gitleaks 8.30.1, exit 0, no findings                    | [Redacted log](source-scan.txt)                                                        |

Commands were run with the portable Node directory first on PATH and npm's CLI
invoked through that Node executable; package scripts are the repository's usual
ones. No new runtime dependency was installed into the project.

Chronology: storage tests `26dd30e` precede implementation `4b50ba2`; worker tests
`ffdab8e` precede implementation `5a69531`. The strengthened null-entry regression
`a1b6c02` genuinely failed before its guard fix. The class-ID collision regression
`2194418` failed before fix `6a2b055`. Historical intermediate test logs are retained
as intermediate results, not relabelled as the final run.

## Limits of this evidence

The process tests use an explicit offline adapter that does not execute C++ or
call a model. Docker's Linux daemon was unavailable locally. These results do not
prove the nine sandbox minimums, real model calls/quality/costs, Accepted status of
the five own cases, new HTTP submission/auth routes or a public deployment.
Those require the corresponding owners' reviewed adapters and live QA.
Team release audit, final tag CI, ZIP verification and human sign-offs remain pending.

The local `pa2` tag was preserved even though it differs from the remote release.
No remote write, force push, merge, tag movement or Classroom submission was part
of this local verification.
