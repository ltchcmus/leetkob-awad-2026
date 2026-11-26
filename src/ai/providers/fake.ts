import type {
  ModelProvider,
  ModelRequest,
  ProviderResult,
  Quota,
} from "../types.ts";

type Step = ProviderResult | ((signal: AbortSignal) => Promise<ProviderResult>);

export class FakeProvider implements ModelProvider {
  readonly model = "fake-model";
  readonly id: string;
  readonly quota: Quota;
  readonly steps: Step[];
  readonly calls: { request: ModelRequest; signal: AbortSignal }[] = [];

  constructor(id: string, quota: Quota, steps: Step[]) {
    this.id = id;
    this.quota = quota;
    this.steps = steps;
  }

  async generate(
    request: ModelRequest,
    signal: AbortSignal,
  ): Promise<ProviderResult> {
    this.calls.push({ request, signal });
    const step = this.steps.shift();
    if (typeof step === "function") return await step(signal);
    return step ?? { kind: "failure", reason: "unavailable" };
  }
}
