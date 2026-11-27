# PA3 evidence audit — integration candidate

This is a technical audit, not a claimed score or release sign-off. Checked
27 November 2026 against integration baseline `5c0de63` and this branch.

| Criterion        | Supported evidence                                                                                              | Remaining requirement                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 deployed flow | Local real HTTP/sandbox test uses five actors, three Accepted sorting submissions and class/privacy checks      | Public URL, exact official sort-merge walkthrough, accounts and recording from deployed SHA                                                       |
| R2 queue/sandbox | Existing M1–M9 tests; added durable quarantine, real killed worker/container cleanup and one stored verdict set | Confirm final hosted Sandbox run and release-tag CI; do not substitute local evidence for the required tag run                                    |
| R3 hard rules    | Shared router, preserved ground truth; findings committed by Công                                               | Hậu's 28 unresolved ban-list pairs and two incorrect decisions need regression/fix and fresh model-off run                                        |
| R4 real model    | Existing numbered dev run has 102 predictions and real Gemini response IDs, usage and cost estimate             | Recheck final checker run; distinguish provider response IDs from unavailable HTTP request IDs; enable worker only with approved durable policies |
| R5 limits/review | Fake-model guards; real HTTP TA decisions, configured deductions, audit and Publish refusal                     | Repeat on public deployment with final authentication and verify student status per FAQ                                                           |
| R6 checker/eval  | Shared CLI/Dockerfile, immutable official manifest, five original plus five extra own cases                     | Hậu label ACK, final committed predictions/report/call logs and reproducible image run on release SHA                                             |
| R7 history       | Original test-first history retained; new persistence tests committed before implementation                     | Review final merged history, including explained migration-version and quarantine contract amendments                                             |
| R8 AI log        | Actual tools, changed/rejected choices and verification recorded                                                | Consolidate all members' final entries without inventing human review or approval                                                                 |

The existing numbered real-model report records one wrongful pair, 72.97% recall
and 32.35% unsure. These full-eval thresholds are scored in PA4, not a PA3 overall
pass threshold. PA3's top hard-rule band still requires complete ban-list decisions
with zero wrongful deductions. Preserve the actual reports; never adjust labels.

Public deployment remains mandatory under the PA3 rubric and must stay available
until PA4 marks are released. No ZIP candidate, deployed SHA, final `pa3` tag CI or
Classroom submission was supplied to this audit, so G11/G13 release sign-off remains
pending. Do not infer full marks from a green local test suite.
