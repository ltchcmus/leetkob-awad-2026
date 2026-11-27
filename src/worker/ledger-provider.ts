import { WorkflowRepository } from "../db/workflow-repository.ts";
import { DurableLedger } from "../db/durable-ledger.ts";
import type { ModelProvider } from "../ai/types.ts";

/** Reserve durably before POST; a duplicate reservation never authorizes another POST. */
export function withDurableQuota(
  provider: ModelProvider,
  context: { databasePath: string; labId: number; attemptId: string },
): ModelProvider {
  return {
    ...provider,
    async generate(request, signal) {
      if (signal.aborted) return { kind: "failure", reason: "cancelled" };
      const repo = new WorkflowRepository(context.databasePath);
      const ledger = new DurableLedger(repo.db);
      try {
        const reservation = ledger.reserveAttempt({
          labId: context.labId,
          provider: provider.id,
          attemptId: context.attemptId,
          reservedTokens:
            Buffer.byteLength(request.prompt) + 64 + request.maxOutputTokens,
          now: Date.now(),
        });
        if (!reservation.allowed || !reservation.dispatchAllowed)
          return { kind: "failure", reason: "budget" };
        try {
          const started = performance.now();
          const result = await provider.generate(request, signal);
          const usage = result.usage;
          const known =
            usage?.inputTokens !== undefined &&
            usage.outputTokens !== undefined;
          ledger.settleAttempt({
            reservationId: reservation.reservationId,
            ...(known && {
              usage: {
                tokens:
                  usage.inputTokens! +
                  usage.outputTokens! +
                  (usage.reasoningTokens ?? 0),
                costMicrousd: 0,
              },
            }),
            outcome: known
              ? result.kind === "success"
                ? "success"
                : "failure"
              : "uncertain",
          });
          const requestId = result.providerRequestId;
          const secrets = [
            process.env.GEMINI_API_KEY,
            process.env.NVIDIA_API_KEY,
          ].filter((value): value is string => Boolean(value));
          const safe = (value: string) =>
            value.length <= 200 &&
            /^[\w./:-]+$/.test(value) &&
            !secrets.some((secret) => value.includes(secret)) &&
            !/(?:AIza|nvapi-|gh[pousr]_|sk-)/.test(value);
          const responseId = result.providerResponseId;
          const safeRequest = requestId && safe(requestId) ? requestId : null;
          const safeResponse =
            responseId && safe(responseId) ? responseId : null;
          if ((safeRequest || safeResponse) && safe(provider.model)) {
            repo.db
              .prepare(
                "INSERT OR IGNORE INTO attempt_model_calls VALUES (?,?,?,?,?,?,?,?,?,?)",
              )
              .run(
                provider.id + ":" + (safeRequest ?? safeResponse),
                context.attemptId,
                provider.id,
                safeRequest,
                safeResponse,
                provider.model,
                usage?.inputTokens ?? null,
                usage?.outputTokens ?? null,
                Math.round(performance.now() - started),
                result.kind,
              );
          }
          if (known && requestId && safe(requestId) && safe(provider.model)) {
            repo.db
              .prepare(
                `INSERT OR IGNORE INTO model_call_metadata(provider_request_id,submission_id,attempt_id,model,input_tokens,output_tokens,duration_ms,cost_microusd)
              SELECT ?,j.submission_id,a.id,?,?,?,?,0 FROM attempts a JOIN jobs j ON j.id=a.job_id WHERE a.id=?`,
              )
              .run(
                requestId,
                provider.model,
                usage.inputTokens!,
                usage.outputTokens!,
                Math.round(performance.now() - started),
                context.attemptId,
              );
          }
          return result;
        } catch {
          ledger.settleAttempt({
            reservationId: reservation.reservationId,
            outcome: "uncertain",
          });
          return { kind: "failure", reason: "connection" };
        }
      } finally {
        repo.close();
      }
    },
  };
}
