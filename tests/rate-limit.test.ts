import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("blocks requests over the limit until the window resets", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(2, 10_000, () => now);

    expect(limiter.consume("user")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume("user")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("user")).toMatchObject({ allowed: false, retryAfterSeconds: 10 });

    now += 10_000;
    expect(limiter.consume("user")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("tracks keys independently", () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000, () => 0);

    expect(limiter.consume("a").allowed).toBe(true);
    expect(limiter.consume("a").allowed).toBe(false);
    expect(limiter.consume("b").allowed).toBe(true);
  });
});
