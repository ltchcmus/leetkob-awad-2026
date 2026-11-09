# SQLite and Gitleaks verification

- **Owner:** Nguyễn Hưng Thịnh (23120200)
- **Date:** 9 November 2026, Vietnam time
- **Repository:** [ltchcmus/leetkob-awad-2026](https://github.com/ltchcmus/leetkob-awad-2026)
  **Verified baseline:** [`bc5e69a8eca6fe3ffa1e9219b75d7f5fb345c038`](https://github.com/ltchcmus/leetkob-awad-2026/commit/bc5e69a8eca6fe3ffa1e9219b75d7f5fb345c038)

## SQLite and transaction checks

A fresh clone at the baseline above used Node.js 24.11.0 and npm 11.6.1. `npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm test` each exited 0. The suite ran 24 tests with 24 passes, 0 failures and 0 skips. GitHub Actions also passed all four checks on this SHA. [Main CI run](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42636832183)

| Probe                         | Observed result                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed and integrity            | Two seed runs with `DATABASE_PATH` unset produced one reviewed lab in `data/leetkob.db`. SQLite integrity was `ok` and Git ignored the database.                     |
| Ownership and pending work    | An unassigned TA, an open deadline, pending judging and an unresolved review were rejected in order. The receipt, mark and audit tables stayed empty.                |
| Write contention              | A separate connection held the write lock. The publication attempt returned `publication-unavailable` and left all three tables empty.                               |
| Rollback after partial writes | A temporary trigger deliberately aborted the audit insert. The receipt and mark inserts rolled back, and the transaction closed.                                     |
| Commit and replay             | First publication stored one receipt, mark snapshot and audit event. After a source score change and reopening SQLite, an assigned TA received the original receipt. |
| Replay authorization          | Removing the first TA's class assignment blocked that TA's retry. The stored receipt, mark and audit row stayed unchanged.                                           |

The storage probes ran against a disposable copy of the seeded database. The checked-in HTTP suite supplies separate evidence for status codes, headers and concurrent requests.

## Secret scanning

Gitleaks **8.30.1** ran on 9 November 2026 at 21:48 +07:00. The Git scan traversed all refs in the fresh clone of the team repository. Git listed 24 reachable commits, and Gitleaks reported 14 commit patches scanned. The directory scan used a `git archive` snapshot of all 38 tracked files at the exact baseline SHA above.

| Scope             | Command                                                                                    | Exit | Findings |
| ----------------- | ------------------------------------------------------------------------------------------ | ---: | -------: |
| Reachable history | `gitleaks git . --log-opts=--all --redact --report-format json --report-path history.json` |    0 |        0 |
| Tracked snapshot  | `gitleaks dir <snapshot> --redact --report-format json --report-path tree.json`            |    0 |        0 |

Both JSON reports contained empty finding arrays. **Issues to resolve: none found.** The history and tracked snapshot were each scanned directly. The submission ZIP's Git metadata identifies the final tag and its separate release scans.
