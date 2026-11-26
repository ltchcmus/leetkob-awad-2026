import { first, object, post, usage } from "./http.ts";
import type { ModelProvider, Quota } from "../types.ts";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export function nvidia(
  model: string,
  apiKey: string,
  quota: Quota,
  fetcher: typeof fetch = fetch,
): ModelProvider {
  return {
    id: "nvidia",
    model,
    quota,
    generate(request, signal) {
      return post(
        fetcher,
        NVIDIA_BASE_URL + "/chat/completions",
        {
          authorization: "Bearer " + apiKey,
        },
        {
          model,
          messages: [{ role: "user", content: request.prompt }],
          max_tokens: request.maxOutputTokens,
          stream: false,
        },
        signal,
        (data) => {
          const choice = first(data.choices);
          const message = object(choice.message);
          const measured = object(data.usage);
          const meta = {
            ...(typeof data.id === "string" && { providerResponseId: data.id }),
            usage: usage(
              measured.prompt_tokens,
              measured.completion_tokens,
              object(measured.completion_tokens_details).reasoning_tokens,
            ),
          };
          if (choice.finish_reason === "content_filter" || message.refusal)
            return { kind: "failure", reason: "refusal", ...meta };
          if (
            choice.finish_reason !== "stop" ||
            typeof message.content !== "string"
          )
            return { kind: "failure", reason: "invalid_schema", ...meta };
          return { kind: "success", text: message.content, ...meta };
        },
      );
    },
  };
}
