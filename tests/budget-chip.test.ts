import { describe, expect, it } from "vitest";
import { budgetChipFromUsage } from "@/components/council-workspace/budget-chip";
import type { AdminUsageResponse } from "@/lib/admin/usage-types";

describe("workspace budget chip", () => {
  it("shows remaining budget when spend is under the monthly cap", () => {
    expect(budgetChipFromUsage(usage({
      monthlyBudgetUsd: 25,
      remainingUsd: 12.4,
      status: "ok",
      estimatedCost: 12.6
    }))).toEqual({
      label: "$12.40 left",
      status: "ok",
      href: "/app/usage"
    });
  });

  it("flags an exceeded budget", () => {
    expect(budgetChipFromUsage(usage({
      monthlyBudgetUsd: 10,
      remainingUsd: -1.2,
      status: "over",
      estimatedCost: 11.2
    })).label).toBe("Over budget");
  });

  it("says when paid generation is disabled", () => {
    expect(budgetChipFromUsage(usage({
      monthlyBudgetUsd: 0,
      remainingUsd: null,
      status: "ok",
      estimatedCost: 0
    })).label).toBe("Budget disabled");
  });

  it("falls back to spend this month when no remaining figure exists", () => {
    expect(budgetChipFromUsage(usage({
      monthlyBudgetUsd: null,
      remainingUsd: null,
      status: "unset",
      estimatedCost: 3.5
    })).label).toBe("$3.50 this month");
  });
});

function usage(input: {
  monthlyBudgetUsd: number | null;
  remainingUsd: number | null;
  status: AdminUsageResponse["budget"]["status"];
  estimatedCost: number;
}): Pick<AdminUsageResponse, "budget" | "totals"> {
  return {
    budget: {
      monthlyBudgetUsd: input.monthlyBudgetUsd,
      status: input.status,
      percentUsed: null,
      remainingUsd: input.remainingUsd
    },
    totals: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: input.estimatedCost,
      eventCount: 0,
      latencyMs: 0,
      evalCount: 0,
      firecrawlCredits: 0,
      firecrawlResults: 0
    }
  };
}
