type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Rate limit must be a positive integer.");
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error("Rate-limit window must be positive.");
  }

  consume(key: string): RateLimitResult {
    const now = this.now();
    const current = this.entries.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + this.windowMs }
      : current;

    if (entry.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      };
    }

    entry.count += 1;
    this.entries.set(key, entry);
    this.prune(now);
    return {
      allowed: true,
      remaining: this.limit - entry.count,
      retryAfterSeconds: 0
    };
  }

  private prune(now: number): void {
    if (this.entries.size < 1024) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}
