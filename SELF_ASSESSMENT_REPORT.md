# PA2 self-assessment — LeeTKOB

**Course:** CSC13114, Advanced Web Application Development, 2026–2027.  
**Checkpoint:** PA#2 harness and quality gate.  
**Team:** 23120200 — 23120222 — 23120252.  
**Repository:** [ltchcmus/leetkob-awad-2026](https://github.com/ltchcmus/leetkob-awad-2026).  
**Assessment ref:** [`5066c13`](https://github.com/ltchcmus/leetkob-awad-2026/commit/5066c138ef2caee8e34c89c19ac3db048c1e5801).  
**Provisional claimed total:** **98/100**.

This assessment records evidence available in the submission repository on 9 November 2026. The final `pa2` tag, release verification and ZIP inspection belong to the later release step and are not claimed here.

## Team and responsibility

| Student           | Student ID | Responsibility area                                                          |
| ----------------- | ---------- | ---------------------------------------------------------------------------- |
| Nguyễn Hưng Thịnh | 23120200   | SQLite repository, transaction verification, persistence and secret scan     |
| Lê Thành Công     | 23120222   | Project configuration, server integration, CI, branch protection and release |
| Nguyễn Phúc Hậu   | 23120252   | HTTP contract, authentication, tests, coverage and self-assessment           |

The table records assigned responsibility, not invented participation. Actual work, tools and validation are attributed in [AI-LOG.md](AI-LOG.md) and Git history.

## Marking table

| #   | Exact PA2 criterion              | Maximum | Claimed | Evidence and reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------- | ------: | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rules file                       |      15 |      15 | [AGENTS.md](AGENTS.md) is short and organized into Stack, Commands, Conventions and Never. It fixes Node 24.11.0, lists the four quality commands, requires RFC 9457 errors and transaction-safe ownership checks, and prohibits secrets, real model calls, unsafe submitted-code execution and changing tests or eval labels to obtain a pass. The replay and ownership rules link to the supplied historical findings while current tests and the replay experiment provide submission-repository evidence.                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | Permissions and secrets          |      10 |       8 | [docs/permissions.md](docs/permissions.md) distinguishes Allowed, Ask first and Never. [.env.example](.env.example) contains only empty values; [.gitignore](.gitignore) excludes environment files, databases, logs and archives. The project explicitly has no provider, no model key, zero model calls and a USD 0 budget. Two points remain unclaimed until Thịnh records a fresh history/tree secret scan against the submission repository and assessed SHA; supplied-source scan files are not reused as current evidence.                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | One command for every check      |      10 |      10 | [README.md](README.md) and [the quality workflow](.github/workflows/quality.yml) use the same commands: `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm test`. Node 24.11.0 is pinned in [.node-version](.node-version), dependencies are locked, and [local API verification](docs/evidence/cong-api-verification.md) records all four checks passing with 24 tests passed and zero failed on the required runtime.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | CI that blocks a merge           |      20 |      20 | [Main protection evidence](docs/evidence/main-protection.md) records required lint, format, typecheck and tests checks, a required up-to-date PR, no bypass actors, and blocked force pushes/deletion. In [PR #8](https://github.com/ltchcmus/leetkob-awad-2026/pull/8), bad commit [`6715f5b`](https://github.com/ltchcmus/leetkob-awad-2026/commit/6715f5b7fbf114ab8ee3e09f9eaf5bd70e4b8c7f) produced a [red tests job](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42514488634/job/128834414780?pr=8) and blocked merging. Source-only repair [`32662ad`](https://github.com/ltchcmus/leetkob-awad-2026/commit/32662ad5a9e40bbe177e4de4fbf768a148c6ca1a) produced the [green job](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42515098585/job/128836282612) before merge. Screenshots and exact SHAs are preserved in [the experiment record](docs/evidence/red-green/experiment-notes.md). |
| 5   | Contract of one LeeTKOB endpoint |      25 |      25 | [docs/contract/publish-lab.md](docs/contract/publish-lab.md) defines the five required sections for `POST /v1/labs/{labId}/publish`: conventions, 13 RFC 9457 errors, publication receipt, ordered endpoint behavior and version policy. It specifies authentication, TA role, non-disclosing class ownership, JSON and byte limits, deadline/pending-state behavior, atomic publication, permanent lab-keyed idempotency and replay HTTP 200. Pagination is explicitly unnecessary for this bounded single-resource operation.                                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | Contract tests that bite         |      15 |      15 | [The coverage map](docs/contract/coverage.md) maps contract clauses and every error type to named tests. [The suite](test/publish.contract.test.ts) exercises real HTTP and file-backed SQLite for ownership, validation, replay, persistence, concurrent requests, write contention and rollback; [authentication](test/auth.test.ts) fails closed. Required-runtime evidence records 24 passed and 0 failed. The unchanged suite caught the deliberate replay regression in PR #8: 22 passed and 2 failed until only `src/app.ts` was repaired.                                                                                                                                                                                                                                                                                                                                                                            |
| 7   | AI-LOG.md                        |       5 |       5 | [AI-LOG.md](AI-LOG.md) records dated, named tasks with the actual owner, tool, Asked for, Kept, Changed, Rejected and Validation fields. It separates supplied historical reference from work performed in this repository, records unsuccessful local validation honestly, does not invent teammate review, and identifies completed evidence separately from pending release work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|     | **Total**                        | **100** |  **98** | Current evidence-based total. A fresh submission-repository secret scan is required before reconsidering the two unclaimed points.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Evidence reviewed by Hậu

### Contract and coverage

- The endpoint remains `POST /v1/labs/{labId}/publish`.
- Only an assigned TA can publish; authentication alone does not establish class ownership.
- A missing lab and a foreign lab use the same safe 404 representation.
- All 13 problem types are mapped to contract tests with RFC 9457 envelopes and required headers.
- Initial success and authorized replay both return HTTP 200; replay returns the original receipt with `Idempotent-Replayed: true` and no duplicate stored effects.
- Coverage claims are limited to named tests and observed runs; they do not claim later C++, model, UI or production identity work.

### CI and negative evidence

- The four documented npm commands match the four CI job names.
- Main protection requires the checks and an up-to-date pull request with no bypass actor.
- The replay mutation changed source only, left the contract and tests unchanged, failed two tests, and was blocked.
- The repair restored HTTP 200, passed the required tests and was merged through the same pull request.
- No independent ownership mutation was performed in this submission repository, so this report does not copy that claim from the supplied-source report.

## Limits and pending evidence

- Thịnh's fresh Gitleaks history/tree scan has not yet been added to the submission repository. Source-package scan reports are reference material, not evidence for this repository.
- Công's final `PA2.md`, release summary, `pa2` tag, tag-triggered CI and release verification are not yet present. They belong to the remaining documentation and release work.
- The Classroom upload and final archive verification have not happened and are not claimed.
- The final mark is determined by the lecturer. This report is an evidence-based self-assessment, not a guaranteed grade.

## Model and safety boundary

PA2 has no model provider, model adapter or model API key. Actual model calls and cost are zero, with a current budget of USD 0 per lab and USD 0 total. This is an absence of integration, not a claim that a paid provider-side cap has been configured.

Student C++ is not executed in PA2. Future sandboxing, model review, eval gates, interfaces, deployment, telemetry and the later load requirement remain outside this checkpoint.

## Follow-up before final submission

1. Thịnh records a fresh secret scan with tool version, scope, assessed SHA and actual result.
2. Công completes `PA2.md` using the current repository, PR, commit and CI links, then performs the authorized release workflow.
3. The team reviews this provisional score after the scan evidence is merged; criterion 2 may be reconsidered up to 10/10 only if the new evidence supports it.
4. The final documentation changes go through a protected pull request; no direct push to `main` is required or claimed.
