# Persistence verification

Verified code: `a2aa38b093f48b3dc5a13095fdabf1cfd672dfec`, based on integration
`5c0de63963c164b5e4f47e5b305d1f55ec33cb9a`. Documentation changes do not alter
the tested runtime. Date: 27 November 2026; Node 24.11.0.

- Lint, formatting and TypeScript checks: exit 0.
- [Normal suite](normal-tests.txt): 152 passed, no failures/skips.
- [Frozen-source sandbox suite](sandbox-tests.txt): 54 passed, no failures/skips.
  Includes real M1–M9, negative controls, ten Accepted own cases, worker crash/
  attempt-UUID cleanup and five-actor HTTP review/Publish/deduction checks.
- Remaining sandbox-labelled containers after verification: zero.
- Gitleaks 8.30.1 history scan: exit 0; no findings.
- Migration 001 and original five own cases: no diff. Official evaluator/labels
  were not edited. Five additional PA4 cases live in a separate folder.

Docker Desktop's initial image store supplied no repository digest. A temporary
loopback-only registry supplied the locally built, immutable reference used here:
`127.0.0.1:15073/leetkob-judge@sha256:f85a93fe44d87c61e7987d526a11948f67a9d2b3dba31654209ce30518bdd613`.
No image was published externally. Hosted CI builds and verifies its own digest;
do not substitute this local digest for the eventual deployment/tag evidence.

Earlier local runs were not clean: one reported transient daemon unavailability,
and a startup scenario failed while migration source was being edited. The
standalone frozen startup test subsequently passed, followed by the complete
54-test frozen suite. The orphan created container from the interrupted run was
removed by its exact ID; this also motivated the persistent ambiguous-mutation
quarantine guard. These failures were not interpreted as student verdicts.

Public deployment, real model dispatch under account-approved durable policies,
Hậu's label ACK, the final tag's CI and final ZIP sign-off remain separate checks.
The R1–R8 audit records the outstanding team evidence; this file claims no grade.
