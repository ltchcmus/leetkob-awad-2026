# LeeTKOB — PA#2

**CSC13114 — Advanced Web Application Development (2026–2027)**

## Team Members

| Member            | Student ID | Responsibilities                                                  |
| ----------------- | ---------- | ----------------------------------------------------------------- |
| Nguyễn Hưng Thịnh | 23120200   | SQLite, publication transactions, data integrity and verification |
| Lê Thành Công     | 23120222   | Project infrastructure, API server integration, CI and release    |
| Nguyễn Phúc Hậu   | 23120252   | HTTP contract, authentication, contract tests and self-assessment |

## 1. Project Overview

LeeTKOB is a teaching assistant support system designed to help manage and verify programming lab assessments.

PA#2 establishes the publishing boundary for lab results, including HTTP authentication, class ownership validation, transactional publication, persistent receipts, error handling and automated contract tests.

The implementation uses Node.js, TypeScript, native HTTP and SQLite.

**Current scope:** The system handles the publication of previously prepared assessment results. Student C++ execution, AI-based grading, full user interfaces and production authentication are outside the PA#2 implementation.

## 2. Requirements

- Windows 11, Linux or another compatible development environment
- Node.js 24.11.0
- npm
- Git

No external database server, Docker environment or model API key is required for the PA#2 local demonstration.

## 3. Installation and Quality Checks

Clone the team repository:

```bash
git clone https://github.com/ltchcmus/leetkob-awad-2026.git
cd leetkob-awad-2026
git checkout pa2
```

Use Node.js 24.11.0 and install dependencies:

```bash
node -v
npm ci
```

Run the four required quality checks:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

| Check     | Purpose                                        |
| --------- | ---------------------------------------------- |
| lint      | Validate source code against ESLint rules      |
| format    | Verify code formatting                         |
| typecheck | Validate TypeScript types                      |
| tests     | Execute authentication and HTTP contract tests |

The test suite contains 26 tests covering authentication, authorization, publishing behavior, concurrency, persistence and error handling.

Each quality check must exit successfully before its corresponding pull request is merged.

## 4. Configuration

Application configuration uses environment variables. The `.env.example` file lists the supported variables without storing credentials.

| Variable          | Default           | Description                                            |
| ----------------- | ----------------- | ------------------------------------------------------ |
| `HOST`            | `127.0.0.1`       | Server bind address                                    |
| `PORT`            | `3000`            | HTTP server port                                       |
| `DATABASE_PATH`   | `data/leetkob.db` | SQLite database file                                   |
| `DEMO_AUTH_TOKEN` | Required          | Local demo authentication token, minimum 32 characters |

The application reads process environment variables directly. It does not automatically load a `.env` file.

Do not commit authentication tokens, local databases or other secrets.

## 5. Local HTTP Demonstration

The following commands are intended for Windows PowerShell.

Create a temporary SQLite database, configure the server and generate a secure demo token:

```powershell
$D = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ([guid]::NewGuid().ToString()))

$env:DATABASE_PATH = "$D/demo.db"
$env:HOST = '127.0.0.1'
$env:PORT = '3108'

$env:DEMO_AUTH_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"

npm.cmd run demo:seed
```

Start the API server in the same PowerShell session:

```powershell
$server = Start-Process node -ArgumentList 'src/server.ts' -NoNewWindow -PassThru
```

After the server reports that it is listening, send two publication requests:

```powershell
$url = "http://127.0.0.1:$env:PORT/v1/labs/1/publish"

foreach ($i in 1,2) {
    curl.exe -sS -D "$D/h$i" -o "$D/b$i" -w '%{http_code}\n' -H "Authorization: Bearer $env:DEMO_AUTH_TOKEN" -H 'Content-Type: application/json' -d '{}' $url
}
```

**Expected behavior:**

- Both requests return HTTP 200.
- Both responses contain identical receipt bodies.
- The second response contains `Idempotent-Replayed: true`.
- The first response does not contain the replay header.

Check the responses:

```powershell
Get-FileHash "$D/b1","$D/b2"
Select-String -Path "$D/h1","$D/h2" -Pattern 'Idempotent-Replayed'
```

Verify authentication failure with an invalid token:

```powershell
curl.exe -i -H 'Authorization: Bearer invalid' -H 'Content-Type: application/json' -d '{}' $url
```

The expected response is HTTP 401 with an RFC 9457 problem JSON body.

Stop the server and clear sensitive environment variables:

```powershell
Stop-Process -Id $server.Id

Remove-Item Env:DEMO_AUTH_TOKEN,Env:DATABASE_PATH,Env:HOST,Env:PORT
```

The demo uses synthetic lab data and does not require real student information.

## 6. Architecture

| File                            | Responsibility                                  |
| ------------------------------- | ----------------------------------------------- |
| `src/server.ts`                 | HTTP server initialization and configuration    |
| `src/app.ts`                    | HTTP routing, validation and response handling  |
| `src/auth.ts`                   | Authentication adapter                          |
| `src/problem.ts`                | Standardized API error responses                |
| `src/repository.ts`             | SQLite persistence and publication transactions |
| `scripts/seed-demo.ts`          | Prepare synthetic demo data                     |
| `test/auth.test.ts`             | Authentication tests                            |
| `test/publish.contract.test.ts` | HTTP and publication contract tests             |

Publication follows the documented HTTP contract.

It validates authentication and class ownership, checks publication requirements and persists results in SQLite.

Publication receipts, marks and audit records are committed atomically. Repeated valid publication requests return the original receipt without creating duplicate records.

## 7. API Contract

**Endpoint:**

```http
POST /v1/labs/{labId}/publish
```

Authentication uses a Bearer token.

Important response statuses include:

| Status | Meaning                                             |
| ------ | --------------------------------------------------- |
| 200    | Published successfully or existing receipt replayed |
| 400    | Invalid JSON or request validation                  |
| 401    | Authentication required                             |
| 403    | Insufficient role permissions                       |
| 404    | Lab not found or inaccessible                       |
| 405    | HTTP method not allowed                             |
| 409    | Publication prerequisites not satisfied             |
| 413    | Request body exceeds allowed size                   |
| 415    | Unsupported media type                              |
| 500    | Internal server error                               |
| 503    | Publication temporarily unavailable                 |

Detailed requirements and expected behavior are documented in:

- [Requirements](docs/requirements.md)
- [Publish Lab Contract](docs/contract/publish-lab.md)
- [Coverage Map](docs/contract/coverage.md)

## 8. CI and Development Workflow

Each team member works on a separate task branch and submits changes through a pull request.

GitHub Actions executes four required quality checks on pull requests to main, pushes to main, and the pa2 tag:

1. lint
2. format
3. typecheck
4. tests

The active `main` branch ruleset requires pull requests, up-to-date branches and passing `lint`, `format`, `typecheck` and `tests` checks before merging. Force pushes and branch deletion are blocked.

[PR #8](https://github.com/ltchcmus/leetkob-awad-2026/pull/8) demonstrates CI enforcement: an intentional HTTP replay regression failed the required tests check and blocked merging. After restoring the correct HTTP 200 response, all checks passed and the PR was merged.

## 9. Security and Resource Limits

The PA#2 implementation does not integrate a model provider.

- Active model provider: none
- Model API key: none
- Model budget and actual spending: USD 0 per lab and USD 0 total
- Model API calls: 0
- Production authentication: not implemented

The local demonstration uses a temporary authentication token and synthetic assessment data.

Permissions and secret-handling requirements are documented in [docs/permissions.md](docs/permissions.md).

## 10. Project Documentation

| Document                    | Purpose                                |
| --------------------------- | -------------------------------------- |
| `AGENTS.md`                 | Project development rules              |
| `AI-LOG.md`                 | Task decisions and AI assistance       |
| `docs/permissions.md`       | Permissions and secret handling        |
| `docs/provenance.md`        | Project information                    |
| `docs/contract/`            | HTTP contract and test coverage        |
| `PA2.md`                    | PA#2 implementation evidence           |
| `SELF_ASSESSMENT_REPORT.md` | Evaluation against assignment criteria |

The evidence and self-assessment documents record the completed PA#2 verification. Release-specific SHA, CI and ZIP evidence is finalized against the final release tag.

## 11. PA#2 Submission

The PA#2 submission uses Git tag `pa2`, including the SQLite and HTTP routing repairs from [PR #12](https://github.com/ltchcmus/leetkob-awad-2026/pull/12).

After the final release tag has been updated and verified, it can be checked out using:

```bash
git fetch --tags
git checkout pa2
```

The final submission archive must include the repository history and required documentation while excluding `node_modules`, local databases and secrets.

**Submission deadline:** 11 November 2026, 22:00 (Asia/Ho_Chi_Minh).

The submission archive must be checked against the release tag, CI results and Gitleaks scan, then extracted and verified before upload.

## 12. Future Development

The following capabilities are outside the current PA#2 implementation:

- Isolated C++ execution and sandboxing
- AI-assisted grading and model integration
- Student and teaching assistant interfaces
- Production identity and account management
- Evaluation datasets and automated grading analysis
- Deployment, monitoring and performance evaluation

These capabilities are intended for subsequent development milestones.
