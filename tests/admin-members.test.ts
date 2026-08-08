import { describe, expect, it } from "vitest";
import { buildOrgMemberUsage } from "@/lib/admin/members";

describe("buildOrgMemberUsage", () => {
  it("aggregates spend and budget status per member", () => {
    const members = buildOrgMemberUsage({
      defaultMonthlyBudgetUsd: 25,
      profiles: [
        { id: "u1", email: "a@example.com", role: "admin", monthly_budget_usd: 10 },
        { id: "u2", email: "b@example.com", role: "member", monthly_budget_usd: null }
      ],
      usageRows: [
        { user_id: "u1", estimated_cost: 9, total_tokens: 100 },
        { user_id: "u1", estimated_cost: 2, total_tokens: 50 },
        { user_id: "u2", estimated_cost: 1, total_tokens: 20 }
      ],
      runRows: [{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }]
    });

    expect(members[0]).toMatchObject({
      id: "u1",
      estimatedCost: 11,
      runCount: 2,
      budgetStatus: "over",
      monthlyBudgetUsd: 10
    });
    expect(members[1]).toMatchObject({
      id: "u2",
      estimatedCost: 1,
      runCount: 1,
      budgetStatus: "ok",
      monthlyBudgetUsd: null,
      remainingUsd: 24
    });
  });
});
