# Public prototype acceptance runbook

Prepared by Thịnh with Codex assistance. Status: prepared; the public walkthrough
has not run. Offline storage/worker tests are not evidence of sandbox minimums,
model quality, production authentication or public availability.

## Prerequisites

Record the exact deployment SHA, URL, API contract revision and five synthetic
accounts: admin, TA A, TA B in another class, and two students enrolled in A.
Confirm the sandbox and checker adapter modules match the worker contract, model
keys remain server-side, and the public account spending limit is configured.
Obtain the published `sort-merge` statement, tests, two constraints and three
solutions (compliant, violation, injection) without changing the official files.

## Walkthrough and paired negative cases

| Case               | Action                                                    | Expected result                                         | Evidence to save                              |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| Lab creation       | TA A creates a fresh lab through the product API/UI       | Statement, tests, constraints and TA deductions persist | Request/status, lab ID, SHA                   |
| Class isolation    | TA B reads that lab and its queue, then a missing ID      | Same non-disclosing status/body                         | Sanitized responses; DB unchanged             |
| Submission         | Student A1 submits compliant C++; retry with the same key | One source record, receipt and job                      | Receipt IDs, row counts                       |
| Source conflict    | Same key with different source                            | Conflict, no additional submission/job                  | Response and row counts                       |
| Worker stopped     | Stop worker, submit another eligible source, restart      | Queued job survives and finishes                        | State transitions, exactly one verdict set    |
| Crash recovery     | Terminate a worker during a lease, restart after expiry   | New attempt, fenced old completion                      | Attempt rows and final set count              |
| Checker stages     | Submit the violation and injection sources                | AC runs hard rules first, then semantic checker         | TA verdicts, source evidence, call log        |
| Student privacy    | Student polls before Publish                              | Judge/per-test results only                             | Response has no constraint results/deductions |
| Student isolation  | Other student requests the submission                     | Non-disclosing refusal                                  | Response and DB unchanged                     |
| Pending judge      | Assigned TA calls Publish during judging                  | 409 judging-pending                                     | Response; no publication/snapshot/audit       |
| Pending checker    | Call Publish after AC but before review rows exist        | 409 reviews-pending                                     | Zero review rows; no publication              |
| Pending review     | Checker done, human decisions still missing               | Publish refused                                         | Queue and response                            |
| Roles              | Student and foreign TA call Publish directly              | 403 / non-disclosing 404                                | Responses; no writes                          |
| Human confirmation | TA reviews each required item                             | Decision/evidence/reviewer/time persist                 | Review and audit IDs                          |
| Publish replay     | Publish completed lab twice                               | One receipt/snapshot/audit; identical replay            | Both responses and stored counts              |

Until the API owner's routes are available, the local HTTP suite covers only the
existing Publish endpoint against the new storage readiness states. The separate
process suite covers worker lifecycle with an explicit offline test adapter.
Run `npm test` for both; every test belongs to the normal project check command.

For the live run, record actual versus expected for every row, time, SHA, sanitized
request/response, result and owner of any defect. Route API/authentication defects
to Hậu, sandbox/checker defects to Công, and storage/worker/review defects to Thịnh.
Do not put provider keys, raw credentials or personal student data in evidence.

## Recording outline (at most five minutes)

1. Show public URL and release SHA; TA A creates the new lab.
2. Submit the three source cases and show queued-to-final judge transitions.
3. Open TA A's queue and show per-constraint verdict, evidence and configured deduction.
4. Demonstrate a student/foreign-TA refusal and Publish refusing a pending review.
5. Show the worker restart result and link the matching CI security run.

The deployment and recording remain the platform owner's deliverables; this
runbook supplies the acceptance cases, not a completed sign-off.
