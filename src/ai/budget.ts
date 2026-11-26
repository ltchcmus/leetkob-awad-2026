/** Attempts are charged at admission, including disconnects and missing usage. */
export class LabBudget {
  private readonly labs = new Map<string, { calls: number; tokens: number }>();
  private readonly maxCalls: number;
  private readonly maxTokens: number;

  constructor(maxCalls: number, maxTokens: number) {
    this.maxCalls = maxCalls;
    this.maxTokens = maxTokens;
  }
  allows(labId: string, tokens: number) {
    const used = this.labs.get(labId);
    if (!used && this.labs.size >= 10_000) return false;
    return (
      (used?.calls ?? 0) < this.maxCalls &&
      (used?.tokens ?? 0) + tokens <= this.maxTokens
    );
  }
  charge(labId: string, tokens: number) {
    const used = this.labs.get(labId) ?? { calls: 0, tokens: 0 };
    this.labs.set(labId, {
      calls: used.calls + 1,
      tokens: used.tokens + tokens,
    });
  }
}
