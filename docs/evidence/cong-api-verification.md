# PA2 — API Server Integration Verification

Date: 2026-11-08
Owner: Le Thanh Cong — 23120222
Branch: pa2/cong-server
Environment: Windows 11, PowerShell, Node.js v24.11.0

## Quality checks

- npm run lint: PASS
- npm run format:check: PASS
- npm run typecheck: PASS
- npm test: PASS
- Tests: 24 passed, 0 failed

## Local HTTP demonstration

Host: 127.0.0.1
Port: 3108
Database: temporary SQLite database
Authentication: locally generated demo bearer token

Verified results:

- Demo database seed: PASS
- API server startup: PASS
- First publication: HTTP 200
- Second publication: HTTP 200
- Receipt body hashes: identical
- First request: no Idempotent-Replayed header
- Second request: Idempotent-Replayed: true
- Invalid bearer token: HTTP 401 Unauthorized
- Error content type: application/problem+json
- WWW-Authenticate: Bearer realm="leetkob"
- Cache-Control: no-store
- X-Content-Type-Options: nosniff

All reported results were observed during local verification.

No authentication token or personal student data is stored in this evidence.
