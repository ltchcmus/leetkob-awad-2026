# Integration verification

## Dependency baseline

The integration candidate extends `650b82d` with the checker image and eval
runner. It includes G1/G4 `5cfd06f`, G2 `aace1b1`, G5 `1f93f84`,
Sandbox `49a9079` and AI `1ce04f1`. The five dependency PRs remain open
at these heads. No new dependency changes were found during the run.
Both main and the peeled pa2 tag stayed at `1c194cd`.

## Local checks

Node 24.11.0 dependency installation, lint, formatting, typecheck, the
135-test suite, and the separate 48-test Docker suite passed. The Docker
suite includes the HTTP admission, stopped worker, queued submission,
process restart, real sandbox judge, checker and single SQLite verdict
set test. No labelled sandbox container remained after the suite.
Separate PA2, G1 and G5 commands passed 26, 11 and 12 tests respectively.
These counts overlap the main suite.

## Rubric evidence

| Criterion | Status     | Evidence and remaining work                                                                                                         |
| --------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R1        | PARTIAL    | Local HTTP/worker flow proven; public VPS flow and accounts pending                                                                 |
| R2        | PARTIAL    | M1–M9 local and earlier hosted Sandbox evidence; durable quarantine/reconciliation, VPS and release-tag CI pending                  |
| R3        | PARTIAL    | MODEL_OFF has zero wrongful deductions, but hard-rule coverage is incomplete; findings assigned to Hậu                              |
| R4        | PARTIAL    | Real-model dev run and call logs recorded; rejected evidence remains unsure; missing provider request IDs are a provider limitation |
| R5        | PARTIAL    | Fake schema/timeout guards and local review/Publish regressions pass; deployment review flow and FAQ remain                         |
| R6        | PARTIAL    | Docker checker and scorer accept predictions; scorer thresholds and separate eval cases need owner review                           |
| R7        | PASS local | Test-first ancestry retained; integration commits preserve module history                                                           |
| R8        | PARTIAL    | AI-LOG records technical work; final team submission audit pending                                                                  |

The baseline supports team feature branches. Deployment and release approval
require the remaining public E2E, persistence, review and tag checks.
