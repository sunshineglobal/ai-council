import { afterEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/cache";

afterEach(() => {
  vi.useRealTimers();
});

describe("TtlCache", () => {
  it("returns stored values until their TTL expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const cache = new TtlCache<string, number>(1_000);

    cache.set("answer", 42);
    vi.advanceTimersByTime(999);
    expect(cache.get("answer")).toBe(42);

    vi.advanceTimersByTime(2);
    expect(cache.get("answer")).toBeUndefined();
  });

  it("supports a per-entry TTL override", () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string, string>(10_000);

    cache.set("short-lived", "value", 50);
    vi.advanceTimersByTime(51);

    expect(cache.get("short-lived")).toBeUndefined();
  });

  it("evicts the least recently used entry at capacity", () => {
    const cache = new TtlCache<string, number>(1_000, 2);
    cache.set("first", 1);
    cache.set("second", 2);

    expect(cache.get("first")).toBe(1);
    cache.set("third", 3);

    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("first")).toBe(1);
    expect(cache.get("third")).toBe(3);
  });
});
