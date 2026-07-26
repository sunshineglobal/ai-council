import { describe, expect, it } from "vitest";
import {
  aggregateUsageRows,
  budgetStatus,
  buildUsageEvent,
  estimateUsageCost,
  normalizeMonthlyBudgetUsd,
  parsePricingValue,
  type UsageRow
} from "@/lib/usage";

describe("usage cost helpers", () => {
  it("parses OpenRouter pricing strings", () => {
    expect(parsePricingValue("0.000001")).toBe(0.000001);
    expect(parsePricingValue("")).toBeUndefined();
    expect(parsePricingValue("not-a-number")).toBeUndefined();
  });

  it("estimates model cost from prompt and completion pricing", () => {
    const cost = estimateUsageCost(
      {
        promptTokens: 1000,
        completionTokens: 500
      },
      {
        prompt: "0.000001",
        completion: "0.000002"
      }
    );

    expect(cost).toBe(0.002);
  });

  it("falls back to zero when pricing is missing", () => {
    expect(estimateUsageCost({ promptTokens: 1000, completionTokens: 500 })).toBe(0);
  });

  it("aggregates rows and recomputes fallback costs for historical zero-cost rows", () => {
    const rows: UsageRow[] = [
      row({ model_id: "model-a", stage: "initial_answer", prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 }),
      row({ model_id: "model-a", stage: "revision", prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, estimated_cost: "0.5" }),
      row({ model_id: "firecrawl", stage: "research_context", prompt_tokens: 250, completion_tokens: 0, total_tokens: 250 })
    ];

    const aggregate = aggregateUsageRows(rows, {
      "model-a": {
        prompt: "0.000001",
        completion: "0.000002"
      }
    });

    expect(aggregate.totalTokens).toBe(1950);
    expect(aggregate.estimatedCost).toBe(0.502);
    expect(aggregate.byModel.find((entry) => entry.name === "model-a")?.estimatedCost).toBe(0.502);
    expect(aggregate.byModel.find((entry) => entry.name === "firecrawl")?.estimatedCost).toBe(0);
    expect(aggregate.byStage.find((entry) => entry.name === "initial_answer")?.estimatedCost).toBe(0.002);
  });

  it("builds eval scoring usage events with estimated costs", () => {
    const usage = buildUsageEvent({
      stage: "eval_scoring",
      modelId: "judge-model",
      usage: {
        promptTokens: 200,
        completionTokens: 50,
        totalTokens: 250
      },
      latencyMs: 300,
      pricing: {
        prompt: "0.000001",
        completion: "0.000004"
      }
    });

    expect(usage).toMatchObject({
      stage: "eval_scoring",
      modelId: "judge-model",
      estimatedCost: 0.0004,
      status: "complete"
    });
  });
});

describe("usage budgets", () => {
  it("classifies budget state", () => {
    expect(budgetStatus(null, 10)).toBe("unset");
    expect(budgetStatus(0, 0)).toBe("ok");
    expect(budgetStatus(0, 0.01)).toBe("over");
    expect(budgetStatus(10, 7.99)).toBe("ok");
    expect(budgetStatus(10, 8)).toBe("warning");
    expect(budgetStatus(10, 10)).toBe("over");
  });

  it("normalizes monthly budget values", () => {
    expect(normalizeMonthlyBudgetUsd(null)).toBeNull();
    expect(normalizeMonthlyBudgetUsd(1.1234567)).toBe(1.123457);
    expect(() => normalizeMonthlyBudgetUsd(-1)).toThrow(/Monthly budget/);
  });
});

function row(overrides: Partial<UsageRow>): UsageRow {
  return {
    stage: "initial_answer",
    model_id: "model-a",
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    latency_ms: 1,
    status: "complete",
    estimated_cost: 0,
    metadata: { estimated: false },
    ...overrides
  };
}
