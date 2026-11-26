# Semantic checker model guards

`loadModelRouter()` in `config.ts` loads backend configuration. Keep one router
per backend process so requests share the provider limits, circuit breakers,
and lab budgets. The counters are in memory and reset on restart. Concurrent
backend processes need a shared quota and budget before dispatch can be enabled
across them.

## Backend environment

Offline and CI execution can use `MODEL_OFF=1` or leave it unset. Use
`FakeProvider` for synthetic tests. Keep real credentials in the backend
environment or secret store. Start from this disabled configuration.

```dotenv
MODEL_OFF=1
LLM_PRIMARY=gemini
LLM_FALLBACK=nvidia
GEMINI_MODEL=gemini-3.8-flash
GEMINI_API_KEY=
NVIDIA_MODEL=moonshotai/kimi-k3.1-pro
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_ALLOW_PAID=false
LLM_LAB_BUDGET_USD=0
LLM_TIMEOUT_MS=30000
LLM_MAX_ATTEMPTS=2
LLM_MAX_OUTPUT_TOKENS=2048
LLM_LAB_MAX_CALLS=
LLM_LAB_MAX_TOKENS=
GEMINI_FREE_VERIFIED_MODEL=
GEMINI_RPM=
GEMINI_RPD=
GEMINI_TPM=
GEMINI_CONCURRENCY=
NVIDIA_FREE_VERIFIED_MODEL=
NVIDIA_RPM=
NVIDIA_RPD=
NVIDIA_TPM=
NVIDIA_CONCURRENCY=
```

Before setting `MODEL_OFF=0`, verify access, rates and data terms in the
actual provider project or account. Confirm that the account cannot incur
charges for the selected model and endpoint. Set `*_FREE_VERIFIED_MODEL` to
the exact verified model ID and use account-confirmed limits or smaller ones.
Supply positive lab call and token limits. The configuration records an
operator attestation. The adapter has no account billing API. An unverified
provider is unavailable for routing. Recheck on a change of credential, model,
account, or tier. Rotate credentials for normal credential management within
the same quota policy.

## Worker and checker integration

Build `SemanticInput` from the immutable C++ source and problem statement.
Pass known student identity strings (including student IDs) for local
redaction. Only the statement, eligible constraint IDs/text and sanitized
source lines are serialized. Keep student metadata out of the statement and
constraint text. Comments and recognized identity strings are masked in
place. Evidence must match both the original physical line and the text
visible to the model. Redacted lines are ineligible as evidence.

Call `orchestrate(input, router, routes, signal)` with an explicit hard-rule
result or a `semantic` route for each constraint. Hard-rule `unsure` remains
final. Missing or duplicate routing decisions become `unsure`. Agree the G5
classification with the hard-rule owner before wiring the CLI or worker.
The returned `ConstraintResult[]` carries a verdict and evidence. Deductions
stay with the deterministic scoring or review code.

Rate limits and lab budgets reserve a conservative token estimate before
each dispatch. A single deadline covers primary and fallback. Outage,
connection failure, and rate limiting can use a distinct eligible fallback.
The same provider is attempted once per evaluation. `Retry-After` controls
when it can be used again. Timeouts, cancellation, safety refusals, and
invalid output become `unsure`.

An optional call-log sink receives per-attempt latency, outcome, provider/model
and an internal correlation ID shared by the attempts. A returned request ID
and a returned response/completion ID use separate fields. Provider usage is
recorded only for fields reported by the provider. USD 0 is attached to an
operator-verified free-only configuration. Synthetic or unverified dispatches
omit cost. The sink receives no prompts, responses, headers or credentials.
