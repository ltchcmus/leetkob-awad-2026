# Assistant permissions and secret handling

## Allowed

Read the repository and supplied course documents. Analyze requirements, implement assigned code and documentation, run deterministic local checks, create topic branches and local commits, prepare pull requests, inspect CI results, review changes and scan for secrets.

Team responsibilities:
- Cong (23120222): repository bootstrap, API server integration, CI, branch protection, red/green experiment and release.
- Hau (23120252): contract, HTTP/authentication, contract tests, coverage and self-assessment report.
- Thinh (23120200): SQLite repository, seed data, transaction verification, secret scanning and independent ZIP validation.

Each member works within the assigned scope. GitHub pushes, merges, repository settings changes and releases are performed by authorized team members after reviewing the relevant changes and evidence.

## Ask first

Ask before external publication, repository creation, permission changes, GitHub pushes, merges, tags, paid infrastructure or provisioning a model key, unless explicitly authorized for the current task. Always ask before spending money, increasing a budget, using personal student data, deleting unrelated work, destructive history rewrites or changing the lecturer's supplied eval labels. Ask the team/product owners about an unresolved product rule rather than silently expanding authority. Ordinary reversible fixes within the authorized task need no repeated approval.

## Never

Expose a token in chat, shell output, a commit, `.git/config`, a test fixture, an artifact or a sandbox. Never bypass protection, force-push main, change labels to pass an eval, invent human participation, or execute untrusted C++ on the host. Never grant submitted code network access, root, host mounts, the Docker socket or any model key.

## Variables and budget

`.env.example` lists all four application variables with empty values. The application does not auto-load `.env`; set variables in the shell or an approved secret manager. `.env` variants, SQLite data and local reports are ignored. No credential is embedded in the Git remote URL. GitHub credentials are obtained from the existing credential manager only by external administrative tooling and are never copied into this repository.

PA2 model provider/model: **none**. No model API key is provisioned or accepted by this application. Model budget: **USD 0 per lab and USD 0 total**; actual model calls and cost: **0 / USD 0**. Adding any model adapter requires a separate reviewed change, a hard per-lab limit and a provider-side spending limit before enabling a key. A future model key must remain entirely outside the judge sandbox. This is an enforced absence of integration, not a claim that a paid provider account has been configured.

The demo bearer token is a local secret selected by the developer, at least 32 characters, and authenticates only the seeded demo TA. Tests inject fixture authentication in process; fixture names cannot authenticate to the standalone server. Full multi-account identity is future work and is not represented as production-ready.

## Verification and incident response

Scan the complete reachable Git history and final archive for secrets before publication and delivery. Record the tool/version and result in `docs/evidence/`. A scanner result is evidence of the scan, not a mathematical guarantee. If a real key is discovered: stop publication, revoke/rotate it, remove the exposure using an explicitly approved history repair, and record what happened honestly. Removing a file from HEAD alone does not repair history.
