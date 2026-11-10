# SQLite and Gitleaks verification — two release stages

- **Baseline owner:** Nguyễn Hưng Thịnh (23120200)
- **Baseline date:** 9 November 2026, Vietnam time
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

## Baseline secret scanning — Thịnh, 9 November

Gitleaks **8.30.1** ran on 9 November 2026 at 21:48 +07:00. The Git scan traversed all refs in the fresh clone of the team repository. Git listed 24 reachable commits, and Gitleaks reported 14 commit patches scanned. The directory scan used a `git archive` snapshot of all 38 tracked files at the exact baseline SHA above.

| Scope             | Command                                                                                    | Exit | Findings |
| ----------------- | ------------------------------------------------------------------------------------------ | ---: | -------: |
| Reachable history | `gitleaks git . --log-opts=--all --redact --report-format json --report-path history.json` |    0 |        0 |
| Tracked snapshot  | `gitleaks dir <snapshot> --redact --report-format json --report-path tree.json`            |    0 |        0 |

Both JSON reports contained empty finding arrays. **Issues to resolve: none found.** The history and tracked snapshot were each scanned directly. The submission ZIP's Git metadata identifies the final tag and its separate release scans.

## Candidate-release secret scan and ZIP verification — Công, 11 November

**Performed by:** Lê Thành Công (23120222). This is a **second, later scan**, not a replacement for Thịnh's baseline results above.

**Candidate commit:** [`08243602bf3a39d13d40d23b502539d7eb807c81`](https://github.com/ltchcmus/leetkob-awad-2026/commit/08243602bf3a39d13d40d23b502539d7eb807c81) (PR #13 merged). **Candidate tag:** annotated `pa2`, tag object `a918d07276f8f288ef14ea1ec3d7436221f12715` at that time.

| Scope                  | Command / method                                                       | Gitleaks                   | Exit | Findings |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------- | ---: | -------: |
| Candidate Git history  | `gitleaks git --log-opts="--all" --redact=100`                         | 8.30.1; 21 patches scanned |    0 |        0 |
| Candidate tracked tree | `git archive pa2`, then `gitleaks dir <extracted-source> --redact=100` | 8.30.1                     |    0 |        0 |

The report files were saved outside the repository, under a temporary scan directory. The candidate's [Quality `pa2` run #27](https://github.com/ltchcmus/leetkob-awad-2026/actions/runs/42857411211) passed its four required checks. Công extracted the candidate ZIP into a separate directory and verified Git integrity (`git fsck --full`), the tag and commit, `npm ci`, lint, formatting, typechecking, and **26/26 passing tests**. The ZIP's `.git/pa2-release-verification.json` recorded the candidate SHA, CI link, both clean scans and archive validation.

**Release boundary:** the scan results above belong to candidate `0824360`. When these evidence documents are subsequently committed, they create a different final SHA. The updated `pa2` tag must receive its own passing CI and fresh Gitleaks scans. The exact **new** SHA, scan results and ZIP verification must be recorded in `.git/pa2-release-verification.json` of the final submission ZIP. This avoids presenting an older scan as proof of a newer commit.
