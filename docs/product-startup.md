# Product startup

The HTTP entrypoint uses WorkflowRepository and applies existing SQLite migrations.
DATABASE_PATH defaults to data/leetkob.db. Configure the same explicit persistent
path for API and worker; do not use an empty path.

DEMO_AUTH_TOKEN retains the single demo TA. AUTH_ADAPTER_MODULE may select an
absolute, trusted server-side module exporting authenticate: AppOptions["authenticate"].
The adapter does not create users, classes or memberships. Bootstrap these with
the existing repository methods. Account management remains with the API owner.
Node does not automatically load .env. Never pass credentials to the judge.

Run npm start and use the worker command in checker-worker-handoff.md.
The startup test launches the real server twice; the Docker product test creates
its lab via HTTP and launches the separate worker with synthetic accounts.

The default trusted policy accommodates lab CPU 1 to 5 seconds, wall CPU times
three, memory 64 to 512 MiB, 16 processes, 1 MiB output and 10-second compilation.
Invalid snapshot limits fail before Docker dispatch. Custom lower controller
ceilings must not be advertised as the standard lab limits. Student request
fields cannot set trusted policy. Versioned lab snapshots remain a dependency
before implementing lab editing.

Worker MODEL_OFF=0 remains blocked pending durable quota and identity-redaction
context. The persistence owner must provide reserveAttempt/settleAttempt and
durable cleanup reconciliation by attempt UUID. The API owner must provide real
account wiring and the student status/per-test contract. Existing TA decisions,
audit and Publish need production-path QA; they already have implementation.

Semantic prompt guidance now covers aliasing, independent storage, data flow and
unsupported inference. Offline tests do not establish real model correctness.
No official evaluation was rerun; its previous wrongful result remains open.

Quality triggers now include pa3 tags. Proposed required checks are lint, format,
typecheck, tests and sandbox; Docker checker runs inside sandbox. Sonar analysis
has no repository workflow; its app-side branch configuration is unverified.
