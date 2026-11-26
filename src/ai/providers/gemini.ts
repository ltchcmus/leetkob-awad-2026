import { first, object, post, usage } from "./http.ts";
import type { ModelProvider, Quota } from "../types.ts";

export function gemini(
  model: string,
  apiKey: string,
  quota: Quota,
  fetcher: typeof fetch = fetch,
): ModelProvider {
  return {
    id: "gemini",
    model,
    quota,
    generate(request, signal) {
      return post(
        fetcher,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": apiKey },
        {
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens,
            responseMimeType: "application/json",
            ...(model === "gemini-3.8-flash" && {
              thinkingConfig: { thinkingLevel: "LOW" },
            }),
          },
        },
        signal,
        (data) => {
          const candidate = first(data.candidates);
          const measured = object(data.usageMetadata);
          const meta = {
            ...(typeof data.modelVersion === "string" && {
              modelActual: data.modelVersion,
            }),
            ...(typeof data.responseId === "string" && {
              providerResponseId: data.responseId,
            }),
            usage: usage(
              measured.promptTokenCount,
              measured.candidatesTokenCount,
              measured.thoughtsTokenCount,
            ),
          };
          if (
            object(data.promptFeedback).blockReason ||
            (typeof candidate.finishReason === "string" &&
              /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION|MODEL_ARMOR/u.test(
                candidate.finishReason,
              ))
          ) {
            return { kind: "failure", reason: "refusal", ...meta };
          }
          const parts = object(candidate.content).parts;
          if (candidate.finishReason !== "STOP" || !Array.isArray(parts))
            return { kind: "failure", reason: "invalid_schema", ...meta };
          const text = (parts as unknown[])
            .map(object)
            .filter((p) => p.thought !== true)
            .map((p) => (typeof p.text === "string" ? p.text : ""))
            .join("");
          return { kind: "success", text, ...meta };
        },
      );
    },
  };
}
