# Manual provider smoke verification

## Account evidence and configuration

The Gemini pricing table lists free Standard text input and output for
`gemini-3.8-flash`. NVIDIA documents the hosted chat endpoint and
`moonshotai/kimi-k3.1-pro`. Confirm that the actual credential's project or
account can use the selected model with no chargeable usage before sending
inference. Capture the effective access tier, available limit and billing
settings in a redacted record. Record any provider-published limit separately
from stricter local caps.

- [Gemini model pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash)
- [Gemini billing](https://aistudio.google.com/docs/billing) and [rate limits](https://aistudio.google.com/docs/rate-limits)
- [NVIDIA hosted endpoint](https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3_1-pro-infer) and [catalog access](https://docs.api.nvidia.com/nim/docs/api-quickstart)

Set the matching `*_MODEL` and `*_FREE_VERIFIED_MODEL` and load the
`*_API_KEY` from the backend secret store or ignored local environment file.
Set `*_RPM`, `*_RPD` and `*_TPM` within confirmed access limits and set
`*_CONCURRENCY=1`. Supply positive `LLM_LAB_MAX_CALLS` and
`LLM_LAB_MAX_TOKENS`. One eligible attempt is sufficient for the smoke.
Token caps must accommodate the router's reservation of prompt bytes, overhead,
and the configured output cap. Keep `LLM_ALLOW_PAID=false` and
`LLM_LAB_BUDGET_USD=0`. Verify the account before setting `MODEL_OFF=0`.
Shell variables take precedence over values loaded via `--env-file`.

## Run once per eligible provider

Use Node 24.11.0. Run these commands individually after verifying each
account. The runner selects only that provider, with one attempt, no
fallback, the configured timeout and the existing output token cap.

```powershell
node --env-file=.env src/ai/smoke.ts gemini
node --env-file=.env src/ai/smoke.ts nvidia
```

The synthetic function `answer()` returns 1 on line 2. The constraint requires
returning 2. A passing smoke produces a validated `violation` with line 2 and
the exact text `  return 1;`. Exit codes are 0 for the expected result, 1
for a dispatched attempt with an unexpected or failed result, and 2 when the
runner is blocked before dispatch. The PR quality suite uses injected
responses, so it needs no provider credentials.

The result JSON includes the dispatch timestamp, requested model, reported
model where available, correlation ID, provider request and response IDs,
usage, latency, HTTP status and validated result. Null or omitted provider
fields mean unavailable. The reported cost is an estimate based on the
verified access tier. Attach separately verified, redacted billing evidence
when the account provides it. Publish only reviewed JSON and redacted account
evidence. Missing per-request billing stays unavailable.

## Integration and follow-up

Hậu can map each constraint to an explicit `semantic` route or a terminal
hard-rule result. Thịnh can use `ConstraintResult[]` and allowlisted call
metadata in the worker. Preserve the immutable source snapshot, honor
cancellation, and persist results through the TA review boundary. Scores stay
with the existing deterministic scoring and review flow.

The runner's counters live in one process. Before production, reserve
provider quota and per-lab calls/tokens in durable shared storage, with
atomic checks across attempts, retries and worker restarts. A single worker
still needs durable accounting or a provider-enforced limit that covers the
required cap. The real dev-set run and 80-submission estimate are separate
deliverables and use measured call counts and usage.
