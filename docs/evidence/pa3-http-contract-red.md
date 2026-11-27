# PA#3 HTTP Contract RED Evidence

Observed before test-suite separation.

- Branch: `feat/hau-g5-hard-rule-cli`
- Commit: `110641a`
- Node.js: `v24.11.0`
- Command: `node --test --test-reporter=spec test/pa3.contract.test.ts`
- Exit code: `1`
- Result: 6 tests total; 1 pass and 5 fail.

The five failures are retained as contract-first RED evidence while the HTTP
routes remain unimplemented. Each failing positive assertion received `404`
from the current application rather than the proposed route result:

1. Owning TA reads a lab: expected `200`, observed `404`.
2. Enrolled student creates a submission: expected `202`, observed `404`.
3. Submitting student reads status: expected `200`, observed `404`.
4. Owning TA reads review queue: expected `200`, observed `404`.
5. Foreign-TA review-queue test: its owning-TA precondition expected `200`,
   observed `404`; therefore its subsequent foreign-access assertion has not
   yet been reached.

The remaining contract test, a student denied publication with no database
mutation, passed. No expected result, handler, or database fixture was changed
to make these failures pass.

When the HTTP implementation is ready, this command must become a required,
genuinely passing status check.
