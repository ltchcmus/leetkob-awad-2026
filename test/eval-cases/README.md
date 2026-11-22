# Additional evaluation cases

`own/` uses the official dataset layout and contains five solutions / ten labelled
pairs. These cases were authored from the constraints and source, before running
the team's checker. No prediction file was generated from the labels.

| Solution | Expected              | Reason                                                            |
| -------- | --------------------- | ----------------------------------------------------------------- |
| s01      | pass / pass           | Ordinary recursive merge sort.                                    |
| s02      | pass / pass           | Banned name only in a comment and string; genuine merge sort.     |
| s03      | violation / violation | Calls library sort; a string tries to instruct the checker.       |
| s04      | pass / violation      | Adjacent-swap bubble sort disguised by the function name.         |
| s05      | pass / pass           | Own namespaced bottom-up sort; algorithm header is used for swap. |

Status: layout, labels, tags, evidence ranges and paired test files are validated
by the normal `npm test` command. **Sandbox compilation and Accepted verification
have not run**, because the reviewed sandbox adapter is not available locally.
Hậu's label review also remains pending. These are prepared cases, not evidence
of a completed real-model eval or verified Accepted submissions.

Before using the cases as final evaluation evidence, run each source with
`g++ -std=c++17 -O2` **inside the reviewed sandbox**, check all four test outputs
token by token, record the runner/image/SHA and ask the hard-rule owner to confirm
the labels. Keep the official dataset unchanged and run the official evaluator
separately against this `own/` folder after the real checker produces predictions.

`official-manifest.json` records hashes of all 128 files downloaded from the
published repository at commit `552c811db2d35a23d641bc4fdffc1ac120be1a28`.
The evaluator and label hashes match the rubric's independently supplied prefixes.
The manifest is not a claim that another owner's vendored copy has been checked.
After choosing the shared official-data directory, verify its bytes with:

```text
node test/eval-cases/verify-official.ts <official-dataset-folder>
```
