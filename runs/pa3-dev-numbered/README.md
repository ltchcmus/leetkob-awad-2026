# Numbered-source evaluation

This run uses checker commit `1c5549f`, the same official dataset commit
`552c811db2d35a23d641bc4fdffc1ac120be1a28`, Gemini 3.1 Flash-Lite MINIMAL,
30-second deadline, 2048 output tokens, concurrency one, one attempt,
no fallback and owner-confirmed free-only access. The original
`runs/pa3-dev` files remain the baseline.

Execution used `node src/ai/evaluate.ts ../leetkob-official-eval runs/pa3-dev-numbered/model-on`
with the backend key loaded privately from the ignored environment file.
Local limits were 39 calls, ten requests/minute, 100000 tokens/minute,
300000 tokens/lab and USD 0. These are application caps. No account quota
maximum is inferred from them.

Both runs contain all 102 pairs. Official scorer exit is 1.
MODEL_OFF predictions are byte-identical to baseline.

| Metric                 | Before | After  |
| ---------------------- | ------ | ------ |
| Wrongful deductions    | 0      | 1      |
| Violation recall       | 32.43% | 72.97% |
| Unsure rate            | 65.69% | 32.35% |
| Invalid evidence calls | 30     | 1      |
| Invalid schema calls   | 0      | 0      |
| Timeouts               | 2      | 2      |
| Provider unavailable   | 0      | 2      |
| Real evaluation calls  | 39     | 39     |

The after run reported 34,807 input and 5,231 output tokens. Four calls
have unavailable usage. Free-tier estimated cost is USD 0. At the
published reference rates USD 0.25/million input and USD 1.50/million
output, extrapolating by 80/47 gives USD 0.02817 for 80 submissions.
This estimate excludes unreported usage. Actual billing is unavailable.
[Pricing](https://aistudio.google.com/docs/pricing#gemini-3.1-flash-lite)

The semantic wrongful pair is `reverse-words/s04 C2`; preserve it as a
model-quality finding for further eval. A valid quote cannot prove that
the model's interpretation of the constraint is correct. The human review
boundary remains required. Checker quality is PARTIAL.

Two additional original-prompt calls diagnosed evidence coordinates,
recorded in `diagnostics.json`. They are excluded from full-run metrics.
No labels were sent to the provider.

Scorer commands:

```powershell
node ../leetkob-official-eval/eval.mjs --data ../leetkob-official-eval --predictions runs/pa3-dev-numbered/model-on/predictions.jsonl --json runs/pa3-dev-numbered/model-on/report.json
node ../leetkob-official-eval/eval.mjs --data ../leetkob-official-eval --predictions runs/pa3-dev-numbered/model-off/predictions.jsonl --json runs/pa3-dev-numbered/model-off/report.json
```
