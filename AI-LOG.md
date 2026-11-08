# LeeTKOB v1.0 — Task and AI Assistance Log

## Project information

Project: LeeTKOB
Release: Initial PA#2 implementation
Repository: https://github.com/ltchcmus/leetkob-awad-2026

## Documentation

- [Project provenance](docs/provenance.md)
- [Agent rules](AGENTS.md)
- [Permissions](docs/permissions.md)
- [Supplied historical reference](docs/history/AI-LOG-baseline.md)

The historical reference preserves its existing authorship, dates and evidence. This task log records work performed in the submission repository.

## Team responsibilities

| Member            | Student ID | Responsibilities                                                                |
| ----------------- | ---------- | ------------------------------------------------------------------------------- |
| Le Thanh Cong     | 23120222   | Project configuration, server integration, CI, branch protection and release    |
| Nguyen Hung Thinh | 23120200   | SQLite, publication transactions, persistence, secret scan and ZIP verification |
| Nguyen Phuc Hau   | 23120252   | HTTP contract, authentication, tests, coverage and self-assessment              |

## 2026-11-08 — Initial project configuration

**Owner:** Le Thanh Cong — 23120222

**Tool:** Windows 11, PowerShell, Git, Node.js, npm, VS Code and ChatGPT.

**Asked for:**

Prepare the initial project configuration, establish the required development environment and organize project documentation for team development.

**Kept:**

- Node.js 24.11.0 as required by the project.
- Supplied dependency versions from package-lock.json.
- TypeScript and ESLint configuration.
- Four agent rule sections: Stack, Commands, Conventions and Never.
- Empty values for environment variables in .env.example.
- Separate preservation of historical reference records.

**Changed:**

- Created the pa2/cong-bootstrap working branch.
- Added project configuration files.
- Established the project documentation structure.
- Added source attribution in docs/provenance.md.
- Defined team responsibilities and permission boundaries.
- Added A03, A06 and A07 links to the historical reference in AGENTS.md.
- Established the root-level PA#2 task log.

**Rejected:**

No additional implementation proposal was rejected during this task.

**Validation:**

- Node.js version: v24.11.0.
- npm.cmd ci: successful.
- Installed packages: 100.
- Reported npm vulnerabilities: 0.
- Installation exit code: 0.
- Source path checks: package.json and src/app.ts found.
- .env.example: four required variables present with empty values.
- Working branch: pa2/cong-bootstrap.

**Pending:**

- Final diff review.
- Commit and pull request.
- Merge confirmation and main SHA.
- Handoff to Hau.

Pending items are not recorded as completed.

## 2026-11-08 — Prepare the active Step 2 execution prompt

**Owner:** Nguyen Phuc Hau — 23120252

**Tool:** OpenAI Codex, local repository inspection, PowerShell and Git.

**Asked for:**

Review the current project folder and the LeeTKOB v1.0 deployment brief, then prepare and refine a prompt for Hau to perform his active Step 2 responsibility directly using the extracted source package.

**Kept:**

- The supplied Step 2 file scope: `docs/requirements.md`, `docs/contract/publish-lab.md`, `docs/contract/coverage.md` and `src/problem.ts`.
- The required `/v1/labs/{labId}/publish` endpoint, 13 error types and HTTP 200 replay behavior as acceptance points to verify from the supplied source.
- The existing repository type boundary: do not create `src/types.ts` or invent the later `repository.ts` integration.
- The requirement to treat coverage as a plan at this stage, not as evidence of executed tests.

**Changed:**

No application or contract files were integrated while drafting the prompt. After the source package became available, the prompt was refined with its verified absolute path for Hau to execute Step 2 directly.

**Rejected:**

- Inventing missing source files or dependency stubs.
- Claiming that Step 2 checks passed before the supplied `LeeTKOB/` source directory is available.
- Running the full test suite while the repository intentionally contains only the Step 1 bootstrap.

**Validation:**

- Inspected all files currently present in the submission repository and the supplied deployment brief.
- Confirmed `main` contains the merged Step 1 bootstrap.
- The source directory was absent during the initial inspection. Before the prompt was regenerated, all four assigned files were found under `23120200-23120222-23120252_100/LeeTKOB/`.
- No test or validation suite was run for this prompt-preparation task.

## 2026-11-08 — Integrate and verify publish contract and problem definitions

**Owner:** Nguyen Phuc Hau — 23120252

**Tool:** OpenAI Codex, local repository inspection, PowerShell and Git.

**Asked for:**

Perform LeeTKOB v1.0 Step 2 by integrating the supplied requirements, publish contract, coverage plan and problem definitions; verify the endpoint, error taxonomy, role and ownership rules, and idempotent replay behavior without implementing later steps. A follow-up request authorized rechecking the completed scope, committing it and pushing the topic branch.

**Kept:**

- The four supplied files byte-for-byte, including the five-section publish contract and its RFC 9457 problem definitions.
- `POST /v1/labs/{labId}/publish` as the single specified operation.
- All 13 supplied problem types and their status mappings.
- Assigned-TA class ownership checks, including rechecking ownership inside the publication transaction and on replay.
- Natural idempotency by lab: replay returns the original persisted receipt with HTTP 200 and makes no additional publication, mark snapshot or audit event.
- `docs/contract/coverage.md` as a coverage plan, not evidence of an executed or passing test suite.
- Repository-owned types remain reserved for the supplied `src/repository.ts` in Step 3; no `src/types.ts` was introduced.

**Changed:**

- Created the `pa2/hau-contract-spec` working branch.
- Added `docs/requirements.md` from the supplied source.
- Added `docs/contract/publish-lab.md` from the supplied source.
- Added `docs/contract/coverage.md` from the supplied source.
- Added `src/problem.ts` from the supplied source.

**Rejected:**

- Creating `src/types.ts`, a repository stub or any module assigned to Steps 3–5.
- Rewriting or improving the supplied contract during integration.
- Treating the planned coverage map as proof that tests have run or passed.
- Running contract tests or the full validation suite before the later source and test modules are integrated.

**Validation:**

- SHA-256 comparison matched the supplied source for all four integrated files.
- Confirmed the contract specifies `POST /v1/labs/{labId}/publish`, 13 problem types and HTTP 200 for both initial success and authorized replay.
- Confirmed replay preserves the original byte-identical receipt and adds `Idempotent-Replayed: true` without additional stored side effects.
- Confirmed `src/problem.ts` has no missing imports or dependency on a Step 3 module.
- Confirmed neither `src/types.ts` nor `src/repository.ts` was created.
- `npm ci` installed 100 locked packages and reported zero vulnerabilities; it also warned that the available Node.js 22.15.1 does not satisfy the required Node.js 24.11.0 engine.
- `npm run lint` exited 0.
- `npm run typecheck` exited 0.
- A targeted Prettier check of the four supplied Step 2 files exited 0.
- The repository-wide `npm run format:check` exited 1 and identified `AGENTS.md`, `AI-LOG.md`, `docs/permissions.md` and `README.md`; the three bootstrap files are outside this task and the supplied Step 2 files were not rewritten.
- No test suite, contract test or full validation command was run for this step.
- No pull request, merge or tag was created.

## 2026-11-08 — Integrate and verify the SQLite publication repository

**Owner:** Nguyễn Hưng Thịnh — 23120200

**Tool:** OpenAI Codex, PowerShell, Git, Python ZIP and SHA-256 checks, Node.js 24.11.0, npm and native SQLite.

**Asked for:**

Complete Step 3 in the team repository after PR #2, verify the imported storage layer and demo seed, and open a PR for review.

**Kept:**

- The source ZIP's `src/repository.ts` and `scripts/seed-demo.ts` byte for byte. Their bytes also match the pinned source commit in `docs/provenance.md`.
- `Principal` and `Publication` in the repository module. `assertAccess` is available to the future HTTP layer, and `publish` rechecks class assignment inside its SQLite write transaction before looking up a stored receipt.
- New publications check the deadline, pending judge work, then undecided reviews. The receipt, mark snapshots and `lab.published` audit event commit together. Authorized replays read the persisted receipt.

**Changed:**

- Added the two assigned files on `codex/pa2-thinh-sqlite-publish`, based on `6ca2ccc`.
- Corrected the local validation environment after the first shell probe supplied an empty `DATABASE_PATH`, which SQLite treated as a temporary database. Reran with the variable unset to exercise the on-disk default.

**Rejected:**

None. The assigned source files were ready to import as supplied.

**Validation:**

- Node.js `v24.11.0`. `npm ci`, `npm run lint` and `npm run typecheck` exited 0. Prettier passed for both imported files and this log.
- With `DATABASE_PATH` unset, `npm run demo:seed` exited 0 twice. SQLite integrity was `ok`. The default `data/leetkob.db` contained one closed lab, one assigned demo TA, one counted submission and one decided review. Publication, mark and audit tables remained empty, and Git ignored the database.
- Storage probes used a disposable copy of the database. An unassigned TA, a future deadline, pending judging, an undecided review and a competing writer were rejected without publication writes. A controlled failure on audit insertion rolled back the receipt and mark snapshot as well as the audit event.
- A successful publish wrote one receipt, one mark and one audit event. After closing and reopening SQLite, another assigned TA received the same receipt bytes even after the source score changed. Revoking the original TA's class assignment blocked a later replay. The snapshot and row counts stayed unchanged.
- The full format check reported existing issues in `AGENTS.md`, `docs/permissions.md` and `README.md`. HTTP contract validation belongs to Step 4.

## 2026-11-08 — Integrate and verify HTTP authentication and contract tests

**Owner:** Nguyen Phuc Hau — 23120252

**Tool:** OpenAI Codex, PowerShell, Git, Node.js, npm and the native Node test runner.

**Asked for:**

Perform LeeTKOB v1.0 Step 4 by integrating the supplied HTTP application, standalone demo authentication adapter and complete 24-test suite; verify authentication, validation, ownership and RFC 9457 error behavior without implementing the Step 5 server. A follow-up request authorized committing the reviewed scope and pushing the topic branch for a user-created pull request.

**Kept:**

- The supplied `src/app.ts`, `src/auth.ts`, `test/auth.test.ts` and `test/publish.contract.test.ts` byte for byte.
- The complete fixture and helper structure, with one authentication test and 23 HTTP contract tests.
- Authentication before role authorization, non-disclosing class ownership checks before body parsing, and a second ownership check inside the publication transaction.
- All 13 problem types, their safe RFC 9457 envelopes and required headers.
- HTTP 200 for initial publication and authorized replay, with a byte-identical receipt and `Idempotent-Replayed: true` only on replay.
- Transaction, replay, persistence, contention and rollback cases remain listed for Thinh's later review; no completed review by Thinh is claimed here.

**Changed:**

- Created the `pa2/hau-http-contract-tests` working branch from main commit `caeb1d7`.
- Added `src/app.ts` and `src/auth.ts` from the supplied source.
- Added `test/auth.test.ts` and `test/publish.contract.test.ts` from the supplied source.

**Rejected:**

- Editing, skipping, renaming or splitting tests to produce a passing result.
- Changing expected statuses, problem types, response bodies, headers, fixtures or the existing contract.
- Adding a TypeScript loader, changing the npm test command or modifying Step 2–3 modules to work around the local Node.js version.
- Adding `src/server.ts` or any Step 5 implementation.

**Validation:**

- SHA-256 comparison matched the supplied source for all four integrated files.
- Static test discovery found one test in `test/auth.test.ts` and 23 tests in `test/publish.contract.test.ts`.
- The available runtime was Node.js `v22.15.1` with npm `11.8.0`, not the required Node.js `24.11.0`; therefore this session does not claim official 24/24 acceptance evidence.
- The first `npm test` attempt exited 1 before loading the test files because the sandbox denied test-runner worker creation with `spawn EPERM`.
- A user-approved retry outside the sandbox exited 1 before executing the 24 test cases because Node.js 22 rejected the `.ts` files with `ERR_UNKNOWN_FILE_EXTENSION`.
- The retry reported two file-level failures, zero passing test files and no contract-test assertion failure; the 24 test cases did not execute.
- No test, fixture, contract, package script or existing implementation file was changed in response to the environment failures.
- The completed scope was authorized for commit and branch push; no pull request, merge or tag was created by the assistant.

## 2026-11-08 — API Server Integration and HTTP Verification

**Owner:** Le Thanh Cong — 23120222

**Tool:** Windows 11, PowerShell, Git, Node.js v24.11.0, npm, ESLint, Prettier, TypeScript, curl and ChatGPT.

**Asked for:**

Integrate the HTTP server with the existing authentication, application and SQLite repository modules. Document installation, configuration, quality checks and local API demonstration. Verify the publishing endpoint through real HTTP requests.

**Kept:**

- The existing HTTP contract and publication behavior.
- The supplied src/server.ts implementation.
- SQLite persistence and atomic publication transactions.
- The existing authentication adapter.
- The 24 authentication and contract tests.
- Loopback binding and temporary SQLite database for local demonstration.

**Changed:**

- Added src/server.ts.
- Updated README.md with installation, configuration, API demonstration and project documentation.
- Applied Prettier formatting to AGENTS.md and docs/permissions.md without intentional rule changes.
- Added docs/evidence/cong-api-verification.md with local verification results.

**Rejected:**

No additional implementation proposal was rejected during this task.

**Validation:**

- Node.js: v24.11.0.
- npm run lint: PASS.
- npm run format:check: PASS.
- npm run typecheck: PASS.
- npm test: 24 passed, 0 failed.
- Demo seed: successful.
- Local server: listening on 127.0.0.1:3108.
- First publication request: HTTP 200.
- Second publication request: HTTP 200.
- Receipt hashes: identical.
- First response: no Idempotent-Replayed header.
- Second response: Idempotent-Replayed: true.
- Invalid bearer token: HTTP 401 Unauthorized.
- Error content type: application/problem+json.
- Authentication challenge and security headers verified.

**Evidence:**

- docs/evidence/cong-api-verification.md

**Pending:**

- Review the Git diff.
- Commit and open the server integration pull request.
- Record the PR URL and merge commit after completion.

## 2026-11-09 — CI and Main Branch Protection

**Owner:** Le Thanh Cong — 23120222

**Tool:** Git, GitHub Actions, GitHub Rulesets, PowerShell.

**Asked for:** Configure automated quality checks and protect the main branch.

**Kept:** Four independent required checks: lint, format, typecheck and tests.

**Changed:** Added GitHub Actions quality workflow and configured main branch protection through a GitHub Ruleset.

**Rejected:** Direct pushes and force pushes to main are disallowed by the protection policy.

**Validation:** GitHub Actions Quality / main #2 passed all four jobs at commit 645968c. Ruleset configuration and main SHA are recorded in docs/evidence/main-protection.md.
