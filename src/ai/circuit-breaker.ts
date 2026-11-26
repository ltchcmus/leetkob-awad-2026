import type { FailureReason, ProviderResult } from "./types.ts";

export function canFallback(reason: FailureReason) {
  return (
    reason === "rate_limit" ||
    reason === "unavailable" ||
    reason === "connection"
  );
}
export class CircuitBreaker {
  private failures = 0;
  private until = 0;
  private probing = false;

  acquire(now: number) {
    if (now < this.until || this.probing) return false;
    if (this.until) this.probing = true;
    return true;
  }
  defer() {
    this.probing = false;
  }

  settle(result: ProviderResult, now: number) {
    this.probing = false;
    if (result.kind === "success" || !canFallback(result.reason)) {
      this.failures = 0;
      this.until = 0;
      return;
    }
    this.failures++;
    if (
      this.failures >= 3 ||
      result.reason === "rate_limit" ||
      result.retryAfterMs
    ) {
      this.until = now + Math.max(30_000, result.retryAfterMs ?? 0);
    }
  }
}
