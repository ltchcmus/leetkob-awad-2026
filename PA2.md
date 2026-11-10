# PA2 — LeeTKOB

CSC13114 · Advanced Web Application Development · 2026–2027

Nguyễn Hưng Thịnh (23120200), Lê Thành Công (23120222), Nguyễn Phúc Hậu (23120252).

| Required evidence         | Record                                                                                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public team repository    | [ltchcmus/leetkob-awad-2026](https://github.com/ltchcmus/leetkob-awad-2026)                                                                                                                                                                                                                         |
| Protected main            | [Active main rules](https://api.github.com/repos/ltchcmus/leetkob-awad-2026/rules/branches/main) and [protection screenshots](docs/evidence/main-protection.md)                                                                                                                                     |
| Blocked merge             | [PR #8](https://github.com/ltchcmus/leetkob-awad-2026/pull/8), [required test failure](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42514488634), and [blocked merge screenshot](docs/evidence/red-green/red-merge-blocked.png)                                                       |
| Deliberate contract break | [`6715f5b`](https://github.com/ltchcmus/leetkob-awad-2026/commit/6715f5b7fbf114ab8ee3e09f9eaf5bd70e4b8c7f) changed the replay response from HTTP 200 to 201. The existing tests rejected the change.                                                                                                |
| Repair and passing checks | [`32662ad`](https://github.com/ltchcmus/leetkob-awad-2026/commit/32662ad5a9e40bbe177e4de4fbf768a148c6ca1a) restored HTTP 200 in the same PR. [All four checks passed](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42515098585).                                                      |
| Tag and CI                | [`pa2` source](https://github.com/ltchcmus/leetkob-awad-2026/tree/pa2), [Quality runs for `pa2`](https://github.com/ltchcmus/leetkob-awad-2026/actions/workflows/quality.yml?query=branch%3Apa2) and [checks on the tagged commit](https://github.com/ltchcmus/leetkob-awad-2026/commit/pa2/checks) |
| SQLite and secrets        | [Verification against the team repository](docs/evidence/thinh-sqlite-and-gitleaks.md)                                                                                                                                                                                                              |
| Rubric and AI log         | [100/100 self-assessment](SELF_ASSESSMENT_REPORT.md) and [team AI task log](AI-LOG.md)                                                                                                                                                                                                              |

Main requires a pull request and four up-to-date checks. The rule blocks force pushes and deletion. The replay experiment and its repair each changed only `src/app.ts`. The contract and tests stayed fixed, and the required tests had to pass before the repaired PR could merge. The team repository's evidence starts with its own Git history and CI runs. [Experiment record](docs/evidence/red-green/experiment-notes.md)

The [contract](docs/contract/publish-lab.md) specifies `POST /v1/labs/{labId}/publish` and the [coverage map](docs/contract/coverage.md) ties its requirements to the executable tests. The [README](README.md) gives the setup and four commands for a fresh checkout on Node.js 24.11.0.

## Final-review regression repairs

[PR #12](https://github.com/ltchcmus/leetkob-awad-2026/pull/12) addresses two additional regressions discovered during final review:

1. **SQLite access contention:** An exclusive database lock during the initial TA ownership check previously returned HTTP 500. Commit [`51ce092`](https://github.com/ltchcmus/leetkob-awad-2026/commit/51ce092) maps SQLite BUSY/LOCKED failures to HTTP 503 `publication-unavailable`, with `Retry-After: 1`, no partial writes and successful retry after lock release.
2. **Non-canonical HTTP paths:** A raw request path containing `/../` could be normalized into a valid route. Commit [`0fd6107`](https://github.com/ltchcmus/leetkob-awad-2026/commit/0fd6107) validates the raw path before URL parsing, preserving the required HTTP 404 response.

The regression tests were introduced separately in commit [`4de49b1`](https://github.com/ltchcmus/leetkob-awad-2026/commit/4de49b1), before the implementation repairs. Expected responses were not weakened or changed.

**Verification:** Node.js 24.11.0; lint, format, typecheck and all 26 tests passed locally after both repairs. [PR #12 CI run 42839951066](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42839951066) passed the four required checks for commit `0fd6107`. The final submission tag requires its own CI and archive verification.

## Submission archive

The PA#2 submission archive is `23120200-23120222-23120252_100.zip`, based on the verified `pa2` tag. It includes the complete `.git/` history, source code, tests and required documentation, while excluding `node_modules/`, local databases and secrets.

The `.git/pa2-release-verification.json` file records the final commit SHA, matching tag CI run, Gitleaks version and scan results, and extracted-archive verification. The ZIP must pass all four quality checks before submission.
