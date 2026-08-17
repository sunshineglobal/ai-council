import { useEffect, useState } from "react";
import { currentMonthValue, monthRange } from "@/components/admin-usage-dashboard/date-utils";
import { budgetChipFromUsage, type BudgetChip } from "@/components/council-workspace/budget-chip";
import type { AdminUsageResponse } from "@/lib/admin/usage-types";
import { requestJson } from "@/lib/client-api";

export function useMonthlyUsage(refreshKey?: string | null): BudgetChip | null {
  const [chip, setChip] = useState<BudgetChip | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const range = monthRange(currentMonthValue());
    const params = new URLSearchParams({ from: range.from, to: range.to });

    void requestJson<AdminUsageResponse>(`/api/usage?${params.toString()}`, { signal: controller.signal })
      .then((usage) => {
        setChip(budgetChipFromUsage(usage));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setChip(null);
      });

    return () => controller.abort();
  }, [refreshKey]);

  return chip;
}
