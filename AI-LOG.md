# LeeTKOB v1.0 — Task and AI Assistance Log

## Project information

Project: LeeTKOB
Release: Initial PA#2 implementation
Repository: https://github.com/ltchcmus/leetkob-awad-2026

## Documentation

- [Project provenance](docs/provenance.md)
- [Agent rules](AGENTS.md)
- [Permissions](docs/permissions.md)

This task log records the team activities, implementation decisions, CI configuration, regression fixes and release verification for PA#2.

## Team responsibilities

| Member            | Student ID | Responsibilities                                                                           |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------ |
| Le Thanh Cong     | 23120222   | Infrastructure, CI, release tag, final Gitleaks scan and submission ZIP verification       |
| Nguyen Hung Thinh | 23120200   | SQLite transactions and persistence, baseline Gitleaks scan, access-lock regression repair |
| Nguyen Phuc Hau   | 23120252   | HTTP contract, authentication, tests, coverage and self-assessment                         |

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
- Organized reference materials during initial project configuration.

**Changed:**

- Created the pa2/cong-bootstrap working branch.
- Added project configuration files.
- Established the project documentation structure.
- Added source attribution in docs/provenance.md.
- Defined team responsibilities and permission boundaries.
- Initially recorded A03, A06 and A07 references in AGENTS.md. Current agent rules now link to PR #8, PR #12 and contract tests.
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

- Verified `src/repository.ts` and `scripts/seed-demo.ts` against the required SQLite behavior during integration.
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

## 2026-11-11 — Verify the candidate release scan and extracted ZIP

**Owner:** Lê Thành Công — 23120222

**Tool:** ChatGPT, Windows 11, PowerShell, Git, Node.js 24.11.0, npm, Gitleaks 8.30.1 and GitHub Actions.

**Asked for:**

Perform the final secret scan and ZIP verification previously assigned to Thịnh, reconcile the evidence with Thịnh's earlier baseline scan, and prepare a traceable PA#2 submission.

**Kept:**

- Thịnh's independent 9 November SQLite checks and baseline Gitleaks results for commit `bc5e69a` (24-test suite); those remain historical evidence, not the final release scan.
- The protected-main workflow, PR #8 red/green experiment and PR #12 regression repairs.
- The original application source, HTTP contract, test expectations and final test count of 26.

**Changed:**

- Updated the release evidence to distinguish Thịnh's baseline scan from Công's candidate-release scan.
- At candidate release commit `08243602bf3a39d13d40d23b502539d7eb807c81`, updated annotated tag `pa2` and checked the tagged CI [Quality run #27](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42857411211).
- Stored the scan, tag, CI and extracted-archive verification record in `.git/pa2-release-verification.json` inside the candidate ZIP.

**Rejected:**

- Attributing Công's candidate-release scan or ZIP verification to Thịnh.
- Treating Thịnh's 9 November baseline SHA and 24-test result as the 11 November release SHA and 26-test result.
- Claiming that a later documentation commit has already been scanned or tagged. Any new commit requires an updated tag, matching CI and new scan evidence.

**Validation:**

- Gitleaks 8.30.1: `gitleaks git --log-opts="--all"` reported 21 commit patches scanned and 0 findings; source scan of the `pa2` tracked-tree snapshot reported 0 findings. Both exit codes were `0`.
- A fresh clone at `0824360` was checked out at the annotated `pa2` tag. The candidate ZIP included `.git/`, code, tests, Markdown evidence and release metadata without `node_modules/` or local databases.
- After extracting the candidate ZIP, `git fsck --full` passed; `npm ci`, lint, format check, typecheck and all 26 tests passed. Git status was clean. The final ZIP was extracted again and its Git objects, tag, commit and metadata verified.
- This entry records the completed verification of **candidate SHA `0824360`**. If documentation is committed after that SHA, the final release SHA and its new Gitleaks/CI/ZIP evidence are recorded separately in the new archive's `.git/pa2-release-verification.json`.

## 2026-11-27 — Build semantic checker guards

**Owner** Lê Thành Công (23120222)

**Tool** Codex, PowerShell, Git, Node.js 24.11.0, and npm.

**Changed**

- Wrote offline tests first and recorded the missing-module failure in commit
  `6aeef25`. Implemented Gemini and NVIDIA adapters, a fake provider, bounded
  routing, quota and lab budgets, prompt sanitization, and evidence validation.
- Added a checker boundary that accepts explicit semantic routing and keeps
  hard-rule results, with allowlisted provider call metadata.

**Rejected**

- Routing every hard-rule `unsure` to the model. The checker needs an explicit
  semantic classification.
- Calling live providers before confirming account access, limits, pricing,
  and data terms. Provider telemetry in the tests is synthetic.

**Validation**

- Node 24.11.0. Dependency install, lint, format check and typecheck passed.
- 28 offline model tests and all 54 repository tests passed.

## 2026-11-27 — Prepare manual provider verification

**Owner** Lê Thành Công (23120222)

**Tool** Codex, PowerShell, Git, Node.js 24.11.0, and npm.

**Changed**

- Added a manual smoke runner that isolates one provider and one synthetic
  request through the existing semantic guards. Added HTTP status and the
  reported model to the allowlisted call metadata.
- Ran the metadata assertions before exposing the new fields, then verified
  both adapters through injected responses. Lint, format check, typecheck,
  30 model tests and all 56 repository tests passed.

**Rejected**

- Treating public model documentation or a configured credential as proof of
  free-only account access. Both live attempts stayed blocked before
  dispatch. No real request, provider usage or billing evidence was recorded.

## 2026-11-27 — Exercise both hosted model adapters

**Owner** Lê Thành Công (23120222)

**Tool** Codex, PowerShell, Git, Node.js 24.11.0, and npm.

**Changed**

- Recorded four real synthetic inference requests under the owner-confirmed
  free tier. Gemini returned one timeout and one HTTP 503. NVIDIA timed out
  both independently and after an injected Gemini 503.
- Set the documented low thinking level for Gemini 3.8 Flash, and tested the
  configured fallback with injected HTTP responses. The router's deadlines,
  output validation and evidence checks were preserved.
- Local lint, format check, typecheck and all 57 tests passed, including 31
  offline model tests.

**Rejected**

- Treating fallback dispatch or a guarded `unsure` as a successful model
  verdict. Retained the failures and unavailable usage and billing fields in
  the evidence.

## 2026-11-27 — Recover semantic inference on a smaller model

**Owner** Lê Thành Công (23120222)

**Tool** Codex, PowerShell, Git, Node.js 24.11.0, and npm.

**Changed**

- Ran three small text diagnostics and two real semantic smokes. Selected
  Gemini 3.1 Flash-Lite after both smokes passed the existing schema,
  deadline, and exact evidence checks. Recorded provider response IDs,
  token usage, latency, and the free-tier pricing basis.
- Extended the manual runner to recognize the selected model and its
  pricing source. Its Gemini adapter requests the documented minimal
  thinking setting.
- Lint, format, typecheck and all 58 repository tests passed, including 32
  offline model tests.

**Rejected**

- Treating HTTP 200 from a text diagnostic as semantic evidence or selecting
  the NVIDIA alternatives that returned HTTP 410. The selected profile
  leaves fallback disabled.

## 21 November 2026 — Durable submission storage: contract and regression tests

Owner: Thịnh (23120200), assisted by Codex.

**Asked for:** Review the proposed submission, queue and review interfaces; preserve
PA2 publishing; implement durable storage with lease recovery and duplicate-result
protection, and prepare integration verification.

**Kept:** The existing HTTP publication contract and table shapes, integer tenths
for scores, short SQLite transactions, and separate sandbox/checker adapters.

**Changed:** The proposed boundary now separates job lifecycle from judge result,
submission retries from execution attempts, and checker readiness from an empty
review queue. Reading `PublicationRepository.publish` showed that absent review
rows alone could not represent incomplete checking. Added regression cases for
that state, fencing stale workers, rollback, admission retries and resubmissions.

**Rejected:** Treating sandbox infrastructure failure as student `WA`/`RE`,
overwriting counted results from an older submission, or claiming the initial
regression run exercised assertions that could not yet load.

**Validation:** On base `1c194cd`, Node 24.11.0: `npm ci`, lint,
format check, typecheck and all 26 existing tests passed. The first new regression
run exited 1 because `src/db/workflow-repository.ts` did not yet exist; no new
behavioral assertion ran in that first run. Tests and the storage contract were
recorded before production implementation. The locally installed Node 25 was
replaced for these commands by a portable 24.11.0 executable verified against the
official SHA-256. Fetch reported a differing local `pa2` tag; it was preserved.

### Durable storage implementation and verification

**Changed:** Added a checksum-tracked migration that leaves the seven PA2 tables
and their positional fixtures intact. New storage persists identities, classes,
enrollment, lab content, immutable submissions, jobs/attempts, verdict sets,
reviews/audit and provider-call metadata. A counted-head pointer prevents older
jobs from overwriting the latest attempt. Publish also checks checker and review
initialization. No model output supplies a score.

**Found and corrected:** Three new tests initially failed during Windows cleanup
because their extra SQLite connection was still open; fixed connection cleanup
in its own commit, without weakening assertions. A later regression genuinely
failed because an empty/contradictory AC test list was accepted. Production code
now requires all configured tests to pass before recording AC.

**Validation:** Node 24.11.0: lint, format check, typecheck and all 46 tests pass
(26 existing + 20 new storage regressions). The tests cover persisted recovery,
lease fencing, bounded infrastructure retries, duplicate completion, transaction
rollback, checker-pending publication, review authorization/versioning, source
size limits and migration compatibility. No sandbox payload or model call ran.

## 21 November 2026 — Separate worker and recovery boundary

Owner: Thịnh (23120200), assisted by Codex.

**Asked for:** Implement the separate worker/review integration boundary and
prepare acceptance tests while the sandbox and API owners build their adapters.

**Kept:** An explicit trusted adapter module, persisted AC checkpoint, conditional
lease renewal and fencing at every result write. The checker input contains only
its documented fields; provider sanitization remains in the checker adapter.

**Changed:** A weak null-output test initially passed because its wrong constraint
count hit another guard. Changed it to the correct count with null entries, saw
`retry` instead of the required TA-only `unsure`, and fixed entry validation.
The stronger test was committed before the fix. Test expectations were not loosened.

**Rejected:** Selecting a fake adapter when production configuration is absent,
equating a worker-side timeout with proof of container cleanup, or counting an
offline orchestration fixture as a real C++/model run.

**Validation:** Worker tests were committed before the production worker; their
first run exited 1 because the worker module did not exist. The implementation
passes ten worker tests, including two using a separate Node process. Stop,
enqueue, restart and crash/recover both leave one persisted verdict set. All 56
tests and the four project quality checks pass on Node 24.11.0. Docker CLI is
installed but its Linux daemon is unavailable on this machine; no nine-minimum
sandbox verification or deployment walkthrough is claimed.

## 21 November 2026 — HTTP acceptance preparation and product policy

Owner: Thịnh (23120200), assisted by Codex.

**Asked for:** Prepare integration QA before the full product walkthrough.

**Kept:** Paired happy/negative cases, direct HTTP requests to the real application,
and the Product Owners FAQ pinned at `2b82b90`.

**Changed:** Replaced the earlier missing-FAQ assumption with verified entries.
Added five HTTP checks covering pending judging, AC with no initialized reviews,
pending human decisions, role/class isolation and successful publication/replay.
The public acceptance runbook explicitly separates these checks from the later
lab-creation/submission/deployment walkthrough.

**Rejected:** Claiming that injection-free fixture authentication or an offline
checker proves deployed authentication, model quality or sandbox security.

**Validation:** All five new HTTP integration cases pass on Node 24.11.0; strict
type checking passes. The full public walkthrough awaits the API routes and
reviewed sandbox/checker adapters. No public QA sign-off has been fabricated.

## 21 November 2026 — Additional evaluation cases and integrity baseline

Owner: Thịnh (23120200), assisted by Codex.

**Asked for:** Prepare at least five independently labelled and tagged cases and
protect the official evaluation data before the real-model run.

**Kept:** Separate official/own-case layouts, original source-line evidence and
labels derived from the declared constraints before observing checker predictions.

**Changed:** Added five sorting cases covering honest recursive/bottom-up merge
sort, comment/string and own-namespace traps, a library-sort injection, and bubble
sort disguised by its function name. Added complete-pair/label/tag/evidence tests
and a byte-integrity verifier. Downloaded the official commit `552c811` into a
temporary review location; all 128 hashes are recorded, with evaluator/label
prefixes cross-checked against the rubric. No official file was edited.

**Rejected:** Generating predictions from labels or declaring cases Accepted
without compiling/running them inside the reviewed sandbox.

**Validation:** Structural own-case checks pass. Hậu's label ACK, sandbox Accepted
verification and real checker/model runs remain pending and are stated in the
case README. No model prediction or provider call log has been fabricated.

### Storage audit — legacy class IDs

**Changed:** Audit found that allocating a new class ID solely from the new
`classes` table could reuse an ID already present in legacy labs/TA assignments,
granting access to unrelated old labs. A regression failed with that exact
collision. Allocation now includes all legacy class IDs, and the review query
also filters current membership in the same statement that reads its rows.
The regression was committed before the production fix; no fixture or expected
authorization outcome was loosened.

### Final local checks

On source commit `6a2b055`, all four quality checks pass and all 65 tests pass
with zero failures or skips. Gitleaks 8.30.1 scanned all reachable history (36
commit patches) and a tracked-source snapshot; both exited 0 with no findings.
The official integrity verifier also passed for all 128 published files. The
verification record distinguishes local results from pending real-adapter and
deployment work. No remote approval, push, CI run or team sign-off is claimed.

## 21 November 2026 — Linux CI crash-recovery fixture

Owner: Thịnh (23120200), assisted by Codex; publication authorized by Thịnh.

**Observed:** After publishing draft PR #16, the first Linux
[CI run](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/44898867978)
passed lint, formatting and type checking but failed the crash/restart case:
one execution attempt existed where two were expected. The same suite had passed
on Windows.

**Changed:** The fixture used default SIGTERM. Linux executes the worker's
graceful shutdown handler, scheduling a delayed retry; Windows terminates that
child abruptly. The crash case now explicitly sends SIGKILL, asserts the
interrupted attempt is still active and leased, waits for the persisted lease
deadline, and requires outcomes `lease_expired` then `completed`.

**Rejected:** Weakening the expected attempt/verdict counts, changing production
retry timing to suit the fixture, or rerunning CI without investigating the cause.
The corrected stimulus and stronger assertions preserve the original contract.

**Local validation:** Node 24.11.0: lint, formatting, typecheck and all 65 tests
pass after the correction. Both process lifecycle tests pass. Linux CI validation
is tracked on draft PR #16; the original failing run remains linked above.

### SonarCloud follow-up

The corrected crash test passed in Linux
[Quality run 44899082079](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/44899082079),
including all 65 tests. SonarCloud separately failed its reliability gate on the
validator's implicit string sort. Added an explicit locale comparator, extracted
validator and worker stages into smaller helpers, and moved the five existing
HTTP test bodies into their discovered test file so analysis sees the real tests.
The assertions, fixtures, labels and migration bytes are unchanged.

Also applied optional/nullish expressions and top-level await suggested by the
analyzer. Deliberately retained sequential worker polling: parallel claims would
change its lifecycle contract. Sonar's PL/SQL duplicate-literal suggestions do not
apply to immutable SQLite CHECK constraints; no analyzer exclusions, quality-gate
thresholds or migration checksum changes were used to silence those suggestions.

## 2026-11-21 - PA#3 proposed contract amendment

**Owner:** Nguyen Phuc Hau - 23120252

**Tool:** OpenAI Codex, PowerShell, Git, portable Node.js 24.11.0, npm and the native Node test runner.

**Asked for:**

Define final student judge-verdict visibility, hard-rule/model checker and CLI adapter proposals, and strengthen contract tests without production changes before user-approved commit.

**Kept:**

- PA#2 publish semantics and all production handlers.
- The original test-first contract commit `2e6211ee3684ed4964f2051ff6fb1a8d95b0d3a5` without amend or rewrite.
- Proposed/PENDING status for Product Owners FAQ, Cong and Thinh decisions.

**Changed:**

- Updated the student status contract to return final `judgeVerdict` values `AC`, `WA`, `TLE`, `MLE`, `RE` or `CE`, while hiding constraint verdicts, deductions and internal evidence before Publish.
- Added a proposed checker input/output boundary, hard-rule precedence, one-based original C++ evidence lines, deduction conversion and JSONL dataset-adapter semantics.
- Strengthened contract tests with explicit hidden-field assertions and an owning-TA route assertion before the foreign-TA review negative case.

**Rejected:**

- Implementing the hard-rule engine, worker, CLI, sandbox or PA#3 HTTP handlers.
- Mocking a fake HTTP response or changing expected results to make the contract tests pass.
- Declaring unacknowledged interfaces frozen.

**Validation:**

- Node.js 24.11.0: `npm run lint`, `npm run format:check` and `npm run typecheck` exited 0.
- `npm test` exited 1 with 27 passing tests and 5 expected contract-first RED tests. Each RED is an absent PA#3 endpoint returning 404 where the proposed contract requires owning-TA lab 200, submission 202, student status 200, owning-TA review queue 200, or the owner precondition of the foreign-TA review test.
- `git diff --check` passed. No production file was changed.

**Pending:**

- Product Owners FAQ: post-Publish student visibility.
- Thinh: queue/review state, scoring aggregation, rounding and persistence.
- Cong: model boundary and final CLI/Docker packaging.

## 2026-11-21 - Syntax-aware hard-rule and checker CLI test-first work

**Owner:** Nguyen Phuc Hau - 23120252

**Tool:** OpenAI Codex, PowerShell, Git, portable Node.js 24.11.0, npm and the native Node test runner.

**Asked for:**

Create test-first coverage for syntax-aware C++ hard rules and a model-off checker CLI without implementing either production module or editing official evaluation files.

**Kept:**

- PA#2 behavior, the G1 interface proposal and all production source files.
- The official dataset, labels and evaluator; no official evaluation source was found locally and none was created or modified.

**Changed:**

- Added own hard-rule tests for a real banned call, comments and strings, namespaces, whitespace-tokenized calls, allowed std::swap, evidence line mapping, prompt injection and no deduction fields.
- Added an own temporary CLI fixture that specifies the proposed --data/--predictions JSONL contract in MODEL_OFF mode.

**Rejected:**

- Raw substring matching that would treat comments or strings as executable C++.
- Mock HTTP responses, model calls, a fake dev run, or changing labels and expected results to obtain a pass.
- Implementing the checker or CLI during this test-first stage.

**Validation:**

- Node.js 24.11.0: lint and typecheck exited 0.
- The full test command exited 1: 27 passed and 11 failed. Six new RED tests are expected because src/checker/hard-rules.ts and src/checker/cli.ts do not exist; five pre-existing PA#3 HTTP contract RED tests still await their handlers.
- Format check exited 1 because AI-LOG.md at the starting commit was not formatted by Prettier; the two new test files were formatted.

**Pending:**

- Official evaluation dataset README, statement.md, constraints.json schema and trap cases are unavailable locally; validate the proposed fixture adapter against those sources before implementation.
- The precise adapter layout and solution identifier representation remain pending that official schema.

## 2026-11-21 - Test-gate separation and HTTP contract RED evidence

**Tool:** OpenAI Codex, PowerShell, Git, Node.js 24.11.0, npm and the native Node test runner.

**Asked for:**

Separate PA#2 regression, checker, and proposed HTTP-contract test gates while retaining the actual HTTP contract RED evidence.

**Changed:**

- Added focused npm scripts for PA#2 regression, checker, and HTTP contract suites.
- Recorded the observed HTTP contract RED result, command, commit, and failure reasons in a repository evidence document.

**Kept:**

- All HTTP contract assertions and their RED results; no handler, expected assertion, fixture, or test was weakened.
- The existing branch-protection ruleset and CI workflow; required-check configuration was not changed.

**Pending:**

- The HTTP contract gate becomes required only after the G4 routes are implemented and the tests pass genuinely.
- The leader must approve any future ruleset or workflow change that alters required-check coverage.

## 2026-11-21 - TA lab-read API completion

**Owner:** Nguyen Phuc Hau - 23120252

**Tool:** OpenAI Codex, PowerShell, Git, portable Node.js 24.11.0, npm and the native Node test runner.

**Asked for:**

Complete the remaining TA lab-read HTTP contract without changing the existing
PA#2 publication behavior.

**Changed:**

- Added a read-only `WorkflowRepository.getLabForTa` method. It reuses the
  existing TA ownership guard and reads only the lab ID, class ID and statement.
- Added `GET /v1/labs/{labId}`. The route authenticates before access, returns
  200 only to an owning TA, and exposes no tests, constraints or internal data.
- Added contract coverage for a request without credentials and Student/Admin
  requests. Rejected requests preserve the persisted database snapshot.

**Rejected:**

- Direct SQL or ownership decisions in the HTTP layer.
- Returning lab testcases, constraints, submissions, review data or checker data.
- Changing PA#2 Publish behavior, schema, migrations, queue logic or existing
  G1 authorization assertions.

**Validation:**

- Node.js 24.11.0: `npm test` passed 79 tests with zero failures or skips.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, and the direct
  26-test PA#2 authentication/publication regression command all exited 0.
- `git diff --check` exited 0. No commit, push or merge was performed.

## 2026-11-21 - G4 security and integration audit

**Owner:** Nguyen Phuc Hau - 23120252

**Tool:** OpenAI Codex, PowerShell, Git, portable Node.js 24.11.0, npm and the native Node test runner.

**Asked for:**

Audit the G4 HTTP boundary for authorization, ownership isolation, request
normalization, submission admission, review decisions, status privacy and PA#2
publication compatibility.

**Changed:**

- The submission route now has its own 64 KiB transport limit, while Publish
  keeps its existing 4 KiB limit.
- New mutation-route role gates run before body validation. A caller with an
  ineligible role receives 403 and cannot use malformed input to change the
  authorization response.
- Added regression tests for both findings; rejected requests preserve the
  database snapshot.

**Rejected:**

- Changing G2 persistence semantics, migrations, queue/worker behavior,
  checker code, or PA#2 publication assertions.
- Treating a permissive UUID-shaped route matcher or a generic problem-detail
  wording as a demonstrated data-disclosure defect.

**Validation:**

- Node.js 24.11.0: `npm test` passed 81 tests with zero failures or skips.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, and the direct
  26-test PA#2 authentication/publication regression command all exited 0.
- `git diff --check` exited 0. No commit, push or merge was performed.

## 2026-11-21 - Submission HTTP body-limit boundary

**Owner:** Nguyen Phuc Hau - 23120252

**Tool:** OpenAI Codex, PowerShell, Git, portable Node.js 24.11.0, npm and the native Node test runner.

**Asked for:**

Separate the HTTP transport allowance for a submission from the persisted
maximum source size, while preserving the PA#2 publication body limit.

**Changed:**

- Raised only the submission HTTP transport limit to 524,288 bytes. The
  repository still rejects source text above 65,536 UTF-8 bytes.
- Made the 413 detail derive from the route's actual byte limit. Publish still
  returns the established 4,096-byte detail; Submission reports 524,288 bytes.
- Added regression tests for a valid 65,536-byte source whose JSON envelope is
  larger, an oversized source rejected by repository validation, and an
  oversized submission transport body rejected with the correct 413 detail.

**Rejected:**

- Changing the repository source-size boundary, schema, migrations, PA#2
  publication behavior, or any checker/queue/model implementation.

**Validation:**

- Node.js 24.11.0: `npm test` passed 83 tests with zero failures or skips.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, and the direct
  26-test PA#2 authentication/publication regression command all exited 0.
- `git diff --check` exited 0. No commit, push or merge was performed.

## 2026-11-22 - Test fixture duplication refactor

**Owner:** Nguyen Phuc Hau - 23120252

**Tool:** OpenAI Codex, PowerShell, Git, Node.js and npm.

**Asked for:** Reduce verified SonarCloud duplicate test blocks without changing
HTTP contracts, test scenarios or production behavior.

**Changed:** Moved the repeated SQLite snapshot, HTTP server lifecycle and
accepted-submission checking setup into focused helpers in
`test/helpers/workflow.ts`. The API authorization, workflow and PA3 contract
tests retain their own identities, persisted fixture setup, cleanup and
assertions.

**Rejected:** Editing production code, checker code, migrations, CI settings,
SonarCloud settings, test assertions or test scenarios to change the quality
result.

**Validation:** On Node.js 24.11.0, `npm test` passed all 83 tests. The direct
PA2 authentication/publication regression command passed all 26 tests. Lint,
typecheck, format check and `git diff --check` exited 0. No commit, push or
merge was performed.

## 2026-11-21 — Implement isolated C++ judging and adversarial container tests

**Owner:** Lê Thành Công — 23120222

**Tool:** Codex, PowerShell, Git, fnm/Node 24.11.0, Docker Desktop/Engine 29.6.1,
Python/pypdf, TypeScript, ESLint, Prettier and Gitleaks 8.30.1. No model provider calls.

**Asked for:** Build a sandbox-only runner, prove its resource and isolation limits,
configure security CI and prepare the worker integration boundary.

**Kept:**

- PA2 HTTP/authentication/database source, all existing tests and quality workflow.
- The original 12 C++ fixtures and sandbox assertions without weakening expectations.
- Test-first commit `ca5690b3e695abeb50bd9096bc654dda7890dd99`: 16 harness tests PASS
  and 13 missing-runner RED results before implementation.

**Changed:**

- Added a digest-pinned judge build and a non-root, network-disabled compile/run runner
  with trusted CPU/wall/output watchdogs, cgroup limits, bounded memory-only artifact
  transport, pristine per-test containers and verified cleanup.
- A fake-daemon test caught create rejection reported as daemon_unavailable; corrected
  it to container_start_failed while preserving the separate infrastructure result.
- Added cancellation and crash-cleanup tests. Corrected the crash observer's unsupported
  process-list query and awaited actual program execution for crash/cancellation;
  the expected exit 77 and cancellation assertions stayed fixed.
- Used single-manifest builds after an observed Docker tag/digest lookup inconsistency;
  the final digest resolves and all actual container tests pass. Root cause is unknown.
- Added a sandbox workflow and worker documentation/example; no hosted CI run is claimed.

**Rejected:**

- Treating Docker flags, synthetic oracle results or local success as hosted/production proof.
- Weak network/root/mount/real-secret experiments. Real weakened CPU/memory controls stayed
  bounded and were rejected by the original oracles without changing their assertions.
- Mapping infrastructure failure to a student CE/RE or allowing retry with uncertain cleanup.

**Validation:**

- npm ci, lint, format:check, typecheck and npm test exit 0; PA2 26/26 PASS.
- Full sandbox command: exit 0, 47/47 PASS, 0 skipped, including real M1-M9.
- Actual worker caller: exit 0, AC; no labeled containers left.
- [Local evidence and source hashes](docs/sandbox/evidence/local-verification.json),
  [test output](docs/sandbox/evidence/local-sandbox-tests.txt) and
  [integration guide](docs/sandbox/worker-integration.md).
- Hosted CI/tag evidence and production VPS verification remain pending.
- No push, merge, tag, GitHub settings change, production deployment or model spending.

## 2026-11-27 — Review sandbox CI and worker handoff

**Owner:** Lê Thành Công — 23120222

**Tool:** Codex, Git, PowerShell, GitHub REST API and Gitleaks.

**Changed:** Scoped CI concurrency by ref so a queued release-tag run is insulated
from branch and PR runs. Added a digest lookup check against the fresh build and
logged the actual checkout SHA, built manifest reference, Docker image ID,
reference policy hash and zero remaining sandbox containers on successful cleanup.
Documented the worker adapter mapping and the retry/cleanup mismatch found in the
current queue branch.

**Rejected:** Treating prior Docker Desktop results or checks from teammate PRs as
hosted sandbox results. The previous local evidence remains tied to its original
source hashes. Publishing the branch and opening the PR are pending GitHub
authentication.

**Hosted review follow-up:** The four Quality jobs passed on the initial PR head.
SonarCloud flagged dependency lifecycle execution and two executable lookups.
The Sandbox workflow now installs dependencies with `--ignore-scripts`.
The trusted controller invokes Docker using its system installation path, and
the Windows test watchdog uses the System32 path for `taskkill.exe`.
The sandbox fixtures and assertions are unchanged.

## 2026-11-27 — Connect the checker and execution worker

**Owner** Lê Thành Công (23120222)

**Tool** Codex, PowerShell, Git, Node.js 24.11.0, SQLite and Docker Desktop.

**Changed**

- Integrated the dependency histories on a separate local branch. Added
  explicit semantic routing and reused the same checker in the CLI and worker.
- Connected the existing worker to the Docker judge and the existing SQLite
  lease and persistence API. Added an offline adapter test and a real process
  restart test using a queued synthetic submission and Docker judge.

**Rejected**

- Treating an unclassified hard-rule result as a model request. Also kept
  sandbox attempts with unconfirmed cleanup from launching again after lease
  recovery. The execution adapter keeps production model dispatch disabled
  until a durable quota ledger is available.

**Validation**

- The new routing and execution tests failed before their entry points existed.
  The first Docker smoke asserted that only the semantic verdict would appear
  in the TA queue. Inspection showed that current persistence creates reviews
  for every evaluation. The corrected test requires both verdicts and one
  persisted verdict set across process restarts.
