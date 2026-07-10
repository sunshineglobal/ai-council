"use client";

import { useEffect, useReducer, useState } from "react";
import type { FormEvent } from "react";
import {
  budgetDraftReducer,
  initialBudgetDraftState
} from "@/components/admin-usage-dashboard/budget-draft";
import { currentMonthValue, monthRange } from "@/components/admin-usage-dashboard/date-utils";
import type { AdminUsageResponse } from "@/lib/admin/usage-types";
import { requestJson } from "@/lib/client-api";

type Notice = { kind: "error" | "success"; text: string };

export function useAdminUsage() {
  const [month, setMonthState] = useState("");
  const [usage, setUsage] = useState<AdminUsageResponse | null>(null);
  const [budgetDraft, dispatchBudgetDraft] = useReducer(budgetDraftReducer, initialBudgetDraftState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    setMonthState(currentMonthValue());
  }, []);

  useEffect(() => {
    if (!month) return;

    const controller = new AbortController();
    const range = monthRange(month);
    setLoading(true);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    void requestJson<AdminUsageResponse>(`/api/admin/usage?${params.toString()}`, { signal: controller.signal })
      .then((body) => {
        setUsage(body);
        dispatchBudgetDraft({ type: "loaded", monthlyBudgetUsd: body.budget.monthlyBudgetUsd });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setUsage(null);
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load usage." });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [month, refreshVersion]);

  function setMonth(value: string) {
    setNotice(null);
    setMonthState(value);
  }

  function refresh() {
    setNotice(null);
    setRefreshVersion((version) => version + 1);
  }

  function setBudgetInput(value: string) {
    dispatchBudgetDraft({ type: "edit", value });
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    const submittedValue = budgetDraft.value;
    const trimmed = submittedValue.trim();
    const monthlyBudgetUsd = trimmed ? Number(trimmed) : null;
    if (monthlyBudgetUsd !== null && (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0)) {
      setNotice({ kind: "error", text: "Enter a valid non-negative monthly budget." });
      setSaving(false);
      return;
    }

    try {
      const body = await requestJson<{ monthlyBudgetUsd: number | null }>("/api/admin/usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyBudgetUsd })
      });
      dispatchBudgetDraft({
        type: "saved",
        monthlyBudgetUsd: body.monthlyBudgetUsd,
        submittedValue
      });
      setNotice({ kind: "success", text: "Budget saved." });
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save budget." });
    } finally {
      setSaving(false);
    }
  }

  return {
    budgetInput: budgetDraft.value,
    loading,
    month,
    notice,
    refresh,
    saveBudget,
    saving,
    setBudgetInput,
    setMonth,
    usage
  };
}
