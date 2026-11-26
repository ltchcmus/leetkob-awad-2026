import type { Quota } from "./types.ts";

export class RateLimiter {
  private minute: { at: number; tokens: number }[] = [];
  private day: number[] = [];
  private active = 0;

  constructor(privateQuota: Quota) {
    this.quota = { ...privateQuota };
  }
  private readonly quota: Quota;

  reserve(tokens: number, now: number): (() => void) | undefined {
    this.minute = this.minute.filter((entry) => now - entry.at < 60_000);
    this.day = this.day.filter((at) => now - at < 86_400_000);
    if (
      this.active >= this.quota.concurrency ||
      this.minute.length >= this.quota.requestsPerMinute ||
      this.day.length >= (this.quota.requestsPerDay ?? Infinity) ||
      this.minute.reduce((sum, entry) => sum + entry.tokens, tokens) >
        this.quota.tokensPerMinute
    )
      return;
    this.minute.push({ at: now, tokens });
    if (this.quota.requestsPerDay !== undefined) this.day.push(now);
    this.active++;
    return () => {
      this.active--;
    };
  }
}
