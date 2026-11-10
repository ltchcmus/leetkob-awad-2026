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

## 2026-11-09 — Assess PA2 criteria against submission evidence

**Owner:** Nguyen Phuc Hau — 23120252

**Tool:** OpenAI Codex, PowerShell, Git, repository documentation and supplied report template.

**Asked for:**

Create a Step 8 branch from the latest main branch, complete `SELF_ASSESSMENT_REPORT.md`, check all seven PA2 criteria against actual evidence in the repository and remote branches, calculate the supported total, and record Hau's work in the task log.

**Kept:**

- The supplied report's seven-criterion structure and maximum score of 100.
- Actual submission-repository evidence for rules, permissions, commands, CI protection, the publish contract, contract tests and AI-assisted work.
- The real replay red/green experiment: PR #8, bad and repair commits, and their red and green CI jobs.
- The explicit PA2 boundary of no model provider, no model key, zero model calls and USD 0 spending.
- Release, tag, upload and teammate review remain unclaimed until they occur.

**Changed:**

- Created `pa2/hau-self-assessment` from main commit `5066c13`.
- Added `SELF_ASSESSMENT_REPORT.md` with all seven criteria, evidence links, criterion scores and a provisional total of 98/100.
- Reserved two points in the permissions/secrets criterion because the submission repository does not yet contain Thinh's fresh history/tree secret scan evidence.
- Added explicit follow-up ownership for the scan, final `PA2.md` and release work.

**Rejected:**

- Copying repository URLs, commits, CI runs, ownership experiments, scan reports or release claims from the supplied source report.
- Claiming an independent ownership mutation that was not performed in this submission repository.
- Claiming a `pa2` tag, release verification, final ZIP validation or Classroom upload before those events occur.
- Claiming 100/100 before the missing submission-repository secret scan is available for review.

**Validation:**

- Confirmed local main and `origin/main` at `5066c13` before branching and inspected all available remote branches.
- Confirmed the current repository does not yet contain `PA2.md`, a `pa2` tag or submission-repository secret scan evidence.
- Verified the report cites the actual `ltchcmus/leetkob-awad-2026` repository, PR #8, bad commit `6715f5b`, repair commit `32662ad`, and their recorded red/green jobs.
- Verified the seven claimed scores sum to 98: 15 + 8 + 10 + 20 + 25 + 15 + 5.
- No test suite, commit, push, pull request, merge, tag or external publication was performed for this documentation task.

## 2026-11-09 — Verify SQLite transactions and scan submission history

**Owner:** Nguyễn Hưng Thịnh — 23120200

**Tool:** OpenAI Codex, Git, PowerShell, Node.js 24.11.0, npm, SQLite, Gitleaks 8.30.1 and the GitHub API.

**Asked for:**

Verify SQLite and the publish transaction after Step 8, scan the team repository for secrets, review the rubric and prepare the Step 9 submission.

**Kept:**

- The integrated storage and HTTP contract, including TA ownership checks, receipt persistence and atomic writes.
- The team's own protection and replay evidence from PR #8, with the failed and repaired runs pinned to their actual commits.

**Changed:**

- Added the SQLite and Gitleaks evidence for `bc5e69a8eca6fe3ffa1e9219b75d7f5fb345c038`.
- Added the required root `PA2.md` index and raised the permissions and secrets claim from 8 to 10 after the clean history and tree scans. The seven criteria now total 100.
- Linked the documented seed rule to the Step 3 environment finding and the replay rule to the team's blocked merge. Clarified the zero model budget in the README.

**Rejected:**

- Using the original source package's secret scans or CI runs as evidence for the team repository.
- Treating the pre-release scan as proof of a later tagged tree. Release verification identifies and scans the final SHA separately.

**Validation:**

- Fresh clone on Node.js 24.11.0. Installation and all four quality commands passed, including 24/24 tests.
- SQLite probes confirmed idempotent seeding, ownership and pending-work guards, write-lock behavior, rollback after a controlled audit insert failure and identical replay after reopening.
- Gitleaks history and tracked-tree scans exited 0 with zero findings. The [evidence record](docs/evidence/thinh-sqlite-and-gitleaks.md) gives the SHA, commands, tool version and scope.
- Confirmed active main rules and PR #8's red/green results against GitHub. Reviewed the blocked merge screenshot and verified that the break and repair changed only `src/app.ts`.

## 2026-11-10 — Add final-review HTTP regression tests

**Owner:** Nguyen Phuc Hau — 23120252

**Tool:** OpenAI Codex, Git, PowerShell, Node.js 24.11.0 through `npx`, npm and the native Node test runner.

**Asked for:**

On the shared `fix/pa2-final-review` branch, add two regression tests before implementation changes: an exclusive SQLite lock must produce the contract's 503 `publication-unavailable` response with `Retry-After: 1`, no partial writes and a successful retry after release; and the raw dot-segment path `/v1/labs/2/../1/publish` must produce a safe 404 `not-found` response with `instance=/v1` and no database writes. Keep the contract expectations unchanged, record the current 500 and 200 failures, then commit and push the red tests for Thinh's handoff.

**Kept:**

- Contract §§1-2 route requirements: only the canonical publish path is valid, unknown paths use `instance=/v1`, and failures leave publication state unchanged.
- Contract §§2 and 4 contention requirements: SQLite locks return 503 `publication-unavailable` with `Retry-After: 1`, no partial state and a safe retry after lock release.
- Existing expected statuses, problem types, response headers and persistence assertions.

**Changed:**

- Added a minimal raw HTTP request helper so the client sends dot segments without URL normalization.
- Added `§§1-2: raw dot-segment path is a safe 404 and cannot publish a different lab`.
- Added `§§2,4: exclusive lock during access check is safe 503 with no partial write and retry succeeds` using `BEGIN EXCLUSIVE` on a second SQLite connection.

**Rejected:**

- Changing the expected 404 to the implementation's current 200 response.
- Changing the expected 503 to the implementation's current 500 response.
- Fixing `src/app.ts` or `src/repository.ts` in the dedicated red-test change.
- Weakening or skipping either regression to make the suite pass.

**Validation:**

- Pulled `fix/pa2-final-review` with `--ff-only`; it was already current at `2f6e785` before editing.
- The machine-default Node.js 22.15.1 could not execute the TypeScript tests, so it is not treated as product evidence.
- A full run with Node.js 24.11.0 discovered 26 tests: 24 passed and exactly the two new regressions failed.
- The raw dot-segment regression expected 404 and observed 200.
- The exclusive-lock regression expected 503 and observed 500.
- No application, repository, contract or expected-value change was made.

## 2026-11-10 — Handle SQLite locks during the TA access check

**Owner:** Nguyễn Hưng Thịnh — 23120200

**Tool:** OpenAI Codex, Git, PowerShell, Node.js 24.11.0, npm and the native Node test runner.

**Asked for:**

Fix the SQLite regression on `fix/pa2-final-review` after Hậu's test commit `4de49b1`. An exclusive lock during TA ownership lookup must produce HTTP 503 with `Retry-After: 1`. The same request should succeed after lock release.

**Kept:**

- The contract's ownership check order, rollback before error translation and existing tests.

**Changed:**

- Extracted one mapper for SQLite `BUSY` (5) and `LOCKED` (6). Both `assertAccess()` and `publish()` use it to raise `publication-unavailable`.
- Applied the mapper at the initial ownership read, where `BEGIN EXCLUSIVE` can prevent SQLite from reading before the publish transaction starts.

**Rejected:**

- Mapping unrelated database or application failures to a retryable 503. The mapper rethrows other errors for their existing handling.

**Validation:**

- Reproduced both failures at `4de49b1`. The exclusive lock returned 500 and the raw dot-segment path returned 200.
- The exclusive-lock regression now passes with HTTP 503, `Retry-After: 1`, zero partial writes and a successful HTTP 200 retry. The existing write contention and audit rollback tests passed too.
- Lint and format passed. The full suite reported 25 passes and 1 failure. The raw-path test still receives 200 where it expects 404.
- Type checking reported TS2379 at `test/publish.contract.test.ts:103`. The raw request helper passes `incoming.statusCode`, which can be `undefined`, to `ResponseInit.status`. This is part of the HTTP handoff.

## 2026-11-10 — Repair raw-path routing and update final-review evidence

**Owner:** Nguyen Phuc Hau — 23120252

**Tool:** OpenAI Codex, Git, GitHub CLI, PowerShell, Node.js 24.11.0 through `npx`, npm and the native Node test runner.

**Asked for:**

Continue Hậu's second final-review turn after Thịnh's SQLite repair: pull the shared branch, reject raw dot-segment paths before URL normalization, update the contract coverage map and self-assessment with the repair work, actual responsibilities, uncompleted scope and the seven-criterion total, run all four quality checks, then push the handoff for Công without changing test expectations.

**Kept:**

- The canonical route and safe unknown-path behavior from contract §§1-2.
- Both regression tests and their original expected 404 and 503 responses.
- Thịnh's focused SQLite access-lock repair in commit `51ce092`.
- The evidence-backed seven-criterion total of 100/100 and explicit zero-provider, zero-model-call, USD 0 boundary.

**Changed:**

- Validated the raw request path against the canonical route before constructing `URL`, preventing dot-segment normalization from turning an invalid target into another lab's valid route.
- Narrowed the raw test helper's optional HTTP status before constructing a `Response`; no expected value changed.
- Expanded the coverage map to 26 tests, including raw dot-segment routing and an exclusive lock during the initial access check.
- Updated the self-assessment with evidence-backed actual responsibilities, 26/26 final-review coverage and a `What we did not manage` section.
- Opened [final-review PR #12](https://github.com/ltchcmus/leetkob-awad-2026/pull/12) against `main` after pushing the repair.

**Rejected:**

- Changing or skipping either regression test to obtain a green run.
- Parsing with `new URL()` before checking the raw request path.
- Claiming merge, retagging, final-SHA scan, replacement ZIP or Classroom resubmission before each event occurs.

**Validation:**

- Pulled `fix/pa2-final-review` with `--ff-only`; it was current at Thịnh's `51ce092` handoff.
- On Node.js 24.11.0, lint and typecheck passed and all 26 tests passed with zero failures.
- The first format check identified only `SELF_ASSESSMENT_REPORT.md`; Prettier formatted that file before the complete gate was rerun.
- The complete rerun passed lint, format, typecheck and all 26 tests on Node.js 24.11.0.
- [PR #12 CI run 42839951066](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42839951066) passed the required lint, format, typecheck and tests jobs for repair commit `0fd6107`.
- No application behavior outside raw-route rejection was intentionally changed.

## 2026-11-10 — Final-review documentation and release preparation

**Owner:** Lê Thành Công — 23120222

**Tool:** ChatGPT, Git, PowerShell, Node.js 24.11.0, npm and Prettier.

**Asked for:**

Review the final changes from Hậu and Thịnh, verify the quality checks, update README.md and PA2.md, and prepare the final-review pull request for release.

**Kept:**

- The existing HTTP contract, regression tests and implementation repairs.
- PR #8 as evidence of the controlled CI red/green experiment.
- The separate contributions and AI-LOG records of Hậu and Thịnh.
- The existing pa2 release tag until the final changes are merged and verified.

**Changed:**

- Updated README.md installation instructions, CI ruleset documentation, PR #8 evidence and test count from 24 to 26.
- Updated PA2.md with PR #12, SQLite access-lock and raw-path repairs, related commits and test evidence.
- Clarified that the replacement release ZIP requires verification against the updated pa2 tag.
- Added this AI-LOG entry describing Công's final-review documentation work.

**Rejected:**

- Changing or weakening test expectations to obtain passing checks.
- Replacing the existing red/green evidence.
- Claiming that the release tag, final scan, ZIP verification or Classroom resubmission was complete before performing those steps.

**Validation:**

- Pulled fix/pa2-final-review at commit 637e3a8.
- On Node.js 24.11.0, lint, format, typecheck and all 26 tests passed locally before the documentation updates.
- Verified that the SQLite exclusive-lock and raw dot-segment regression tests passed.
- README.md and PA2.md passed Prettier format checks and git diff --check after editing.
- PR #12: https://github.com/ltchcmus/leetkob-awad-2026/pull/12
- Final documentation commit, PR merge, updated release tag and replacement ZIP remain pending.
