import { AlertTriangle, WalletCards } from "lucide-react";
import type { AdminUsageResponse } from "@/lib/admin/usage-types";
import { formatCurrency } from "@/lib/format";
import type { BudgetStatus } from "@/lib/usage";

export function BudgetBanner({ usage }: { usage: AdminUsageResponse }) {
  const status = usage.budget.status;
  const budget = usage.budget.monthlyBudgetUsd;
  const percent = usage.budget.percentUsed;
  const remaining = usage.budget.remainingUsd;

  return (
    <div className={`usage-banner ${status}`}>
      {status === "over" || status === "warning" ? <AlertTriangle size={18} /> : <WalletCards size={18} />}
      <div>
        <strong>{budgetTitle(status)}</strong>
        <p>
          {budget === null
            ? `${formatCurrency(usage.totals.estimatedCost)} estimated this month.`
            : `${formatCurrency(usage.totals.estimatedCost)} of ${formatCurrency(budget)} used${
                percent === null ? "" : ` (${percent}%)`
              }. Remaining: ${formatCurrency(remaining ?? 0)}.`}
        </p>
      </div>
    </div>
  );
}

function budgetTitle(status: BudgetStatus) {
  if (status === "over") return "Budget exceeded";
  if (status === "warning") return "Approaching budget";
  if (status === "ok") return "Budget on track";
  return "No monthly budget set";
}
