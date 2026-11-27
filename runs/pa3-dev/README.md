# Evaluation record

Dataset repository is https://github.com/fithcmus/awad-leetkob-eval at
`552c811db2d35a23d641bc4fdffc1ac120be1a28`. The input remains in a separate
checkout. `dataset.json` records counts and SHA-256 hashes of every input.
Checker generation reads statement, constraints and source files only.
The scorer and the post-run hard-rule audit read labels.

## Reproduce

```powershell
git clone https://github.com/fithcmus/awad-leetkob-eval ../leetkob-official-eval
git -C ../leetkob-official-eval checkout 552c811db2d35a23d641bc4fdffc1ac120be1a28
docker build -f Dockerfile.checker -t leetkob-checker:g9b .
$dataset = (Resolve-Path ../leetkob-official-eval).Path
$output = (Resolve-Path runs/pa3-dev/model-off).Path
docker run --rm --network none --read-only --memory 256m --memory-swap 256m --pids-limit 64 --cap-drop ALL --security-opt no-new-privileges -e MODEL_OFF=1 --mount "type=bind,source=$dataset,target=/dataset,readonly" --mount "type=bind,source=$output,target=/output" leetkob-checker:g9b --data /dataset --predictions /output/predictions.jsonl
node ../leetkob-official-eval/eval.mjs --data ../leetkob-official-eval --predictions runs/pa3-dev/model-off/predictions.jsonl --json runs/pa3-dev/model-off/report.json
```

Apply an outer 60-second command timeout when invoking the container. The
observed container exited 0 within that bound. It ran as user node with
network mode none. A bind-mounted output directory must be writable by
the container user. Input is read-only.

The real run uses `node src/ai/evaluate.ts <dataset> <existing-output-dir>`.
Load the ignored backend environment with Node's `--env-file` or a secret
manager. Never pass the environment file to the judge or checker image.
The run profile selected Gemini 3.1 Flash-Lite, minimal thinking, output
cap 2048, deadline 30000 ms, no fallback and one attempt. It capped calls
at 39, concurrency at one, a local limit of ten requests/minute and
100000 reserved tokens/minute, and a 300000-token lab budget.
These are application limits. Account quota remains unmeasured.

The first process reached its local minute limit after ten completed
submissions. It saved progress. The second process resumes by persisted
solution/constraint keys and spaces requests by 6.5 seconds, retaining
the overall cap of 39 calls across logs. HTTP 429 stops the run with the
affected submission pending. Timeout and rejected evidence remain
guarded unsure results. Inspect progress and logs before resuming.

## Interpretation

MODEL_OFF scorer exit is 1, with 0 wrongful deductions, recall 21.62%
and unsure rate 73.53%. Hard rules decided 27 of 55 ban-list pairs.
`hard-rule-findings.json` gives unresolved or incorrect pairs for Hậu
to investigate without changing the official data or labels.

No provider request ID is invented when the response contains only a
response ID. Logs omit prompt bodies, credentials and provider response
text. Free-tier USD 0 estimates use owner-attested access. Actual billing
records remain unavailable.

## Real-run results and cost

The completed run issued 39 requests and produced all 102 pairs.
Scorer exit 1 reports 0 wrongful deductions, 32.43% recall (12/37)
and 65.69% unsure (67/102). Seven calls passed output guards, 30 were
rejected for invalid evidence, and two timed out. These failures remain
unsure in predictions.

Reported usage totals 28,532 input and 4,831 output tokens. Usage for
the two timed-out requests is unavailable. Latency p50 is 1,232 ms and
p95 is 30,014 ms. The sample has 39 semantic submissions among 47.
Scaling its measured usage by 80/47 gives approximately 66.38 calls,
48,565 input and 8,223 output tokens for 80 submissions.

Within the owner-confirmed free tier and available quota, estimated
cost is USD 0. A paid reference using USD 0.25/million input and
USD 1.50/million output is:
`(28532 × 0.25 + 4831 × 1.50) / 1000000 × 80 / 47 = USD 0.02448`.
This reference excludes unavailable timeout usage and is based on a small,
public dataset with a high guard rejection rate. Actual billing evidence
and the account's remaining quota are unavailable. At ten local requests
per minute, the extrapolated calls alone need at least 6.64 minutes.
[Pricing checked 2026-11-27](https://aistudio.google.com/docs/pricing#gemini-3.1-flash-lite)

The initial Windows checkout converted line endings to CRLF. The run's
checker normalizes physical lines. The dataset was restored to exact Git
blob bytes, and all 128 official manifest hashes were verified. MODEL_OFF
was rerun and both scorer reports use the exact official scorer and labels.
