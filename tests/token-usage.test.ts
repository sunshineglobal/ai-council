import { describe, expect, it } from "vitest";
import { estimateTokens, normalizeUsage, summarizeUsage } from "@/lib/token-usage";
import type { UsageEvent } from "@/lib/types";

describe("token usage helpers", () => {
  it("estimates tokens when providers omit usage", () => {
    const usage = normalizeUsage(undefined, "hello world", "short answer");

    expect(usage.promptTokens).toBeGreaterThan(0);
    expect(usage.completionTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
    expect(usage.estimated).toBe(true);
  });

  it("keeps provider usage when available", () => {
    const usage = normalizeUsage(
      {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      },
      "ignored",
      "ignored"
    );

    expect(usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      estimated: false
    });
  });

  it("summarizes usage by stage and model", () => {
    const events: UsageEvent[] = [
      event("initial_answer", "model-a", 10),
      event("initial_answer", "model-b", 12),
      event("judge_synthesis", "judge", 20)
    ];

    const totals = summarizeUsage(events);

    expect(totals.totalTokens).toBe(42);
    expect(totals.byStage.initial_answer.totalTokens).toBe(22);
    expect(totals.byModel["model-a"].totalTokens).toBe(10);
    expect(totals.byModel.judge.totalTokens).toBe(20);
  });

  it("uses a stable rough estimate", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

function event(stage: UsageEvent["stage"], modelId: string, totalTokens: number): UsageEvent {
  return {
    stage,
    modelId,
    promptTokens: totalTokens,
    completionTokens: 0,
    totalTokens,
    latencyMs: 1,
    status: "complete",
    estimatedCost: 0
  };
}
