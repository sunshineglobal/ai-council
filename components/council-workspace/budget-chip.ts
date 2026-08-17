import type { AdminUsageResponse } from "@/lib/admin/usage-types";
import { formatCompactCurrency } from "@/lib/format";
import type { BudgetStatus } from "@/lib/usage";

export type BudgetChip = {
  label: string;
  status: BudgetStatus;
  href: string;
};

export function budgetChipFromUsage(usage: Pick<AdminUsageResponse, "budget" | "totals">): BudgetChip {
  const budget = usage.budget.monthlyBudgetUsd;

  if (budget === 0) {
    return { label: "Budget disabled", status: usage.budget.status, href: "/app/usage" };
  }

  if (usage.budget.status === "over") {
    return { label: "Over budget", status: "over", href: "/app/usage" };
  }

  if (budget == null || usage.budget.remainingUsd == null) {
    return {
      label: `${formatCompactCurrency(usage.totals.estimatedCost)} this month`,
      status: usage.budget.status,
      href: "/app/usage"
    };
  }

  return {
    label: `${formatCompactCurrency(usage.budget.remainingUsd)} left`,
    status: usage.budget.status,
    href: "/app/usage"
  };
}
