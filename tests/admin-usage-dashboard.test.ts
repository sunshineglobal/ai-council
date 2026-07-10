import { describe, expect, it } from "vitest";
import {
  currentMonthValue,
  formatRange,
  monthRange
} from "@/components/admin-usage-dashboard/date-utils";
import {
  budgetDraftReducer,
  initialBudgetDraftState
} from "@/components/admin-usage-dashboard/budget-draft";

describe("admin budget draft state", () => {
  it("uses loaded values while the draft is clean", () => {
    expect(budgetDraftReducer(initialBudgetDraftState, {
      type: "loaded",
      monthlyBudgetUsd: 25
    })).toEqual({ value: "25", syncedValue: "25" });
  });

  it("preserves an in-progress edit when a refresh completes", () => {
    const loaded = budgetDraftReducer(initialBudgetDraftState, {
      type: "loaded",
      monthlyBudgetUsd: 25
    });
    const edited = budgetDraftReducer(loaded, { type: "edit", value: "40" });

    expect(budgetDraftReducer(edited, {
      type: "loaded",
      monthlyBudgetUsd: 30
    })).toEqual({ value: "40", syncedValue: "30" });
  });

  it("does not replace an edit made while a save is in flight", () => {
    const loaded = budgetDraftReducer(initialBudgetDraftState, {
      type: "loaded",
      monthlyBudgetUsd: 25
    });
    const submitted = budgetDraftReducer(loaded, { type: "edit", value: "40" });
    const editedAgain = budgetDraftReducer(submitted, { type: "edit", value: "50" });
    const saved = budgetDraftReducer(editedAgain, {
      type: "saved",
      monthlyBudgetUsd: 40,
      submittedValue: "40"
    });

    expect(saved).toEqual({ value: "50", syncedValue: "40" });
    expect(budgetDraftReducer(saved, {
      type: "loaded",
      monthlyBudgetUsd: 40
    })).toEqual({ value: "50", syncedValue: "40" });
  });

  it("normalizes the saved value when the submitted draft is unchanged", () => {
    const edited = budgetDraftReducer(initialBudgetDraftState, { type: "edit", value: "40.00" });

    expect(budgetDraftReducer(edited, {
      type: "saved",
      monthlyBudgetUsd: 40,
      submittedValue: "40.00"
    })).toEqual({ value: "40", syncedValue: "40" });
  });
});

describe("admin usage month formatting", () => {
  it("zero-pads months at both ends of the year", () => {
    expect(currentMonthValue(new Date(2025, 0, 15))).toBe("2025-01");
    expect(currentMonthValue(new Date(2025, 11, 15))).toBe("2025-12");
  });
});

describe("admin usage month ranges", () => {
  it("uses an exclusive next-month boundary across leap day", () => {
    expect(monthRange("2024-02")).toEqual({
      from: new Date(2024, 1, 1).toISOString(),
      to: new Date(2024, 2, 1).toISOString()
    });
  });

  it("rolls December into the following year", () => {
    expect(monthRange("2025-12")).toEqual({
      from: new Date(2025, 11, 1).toISOString(),
      to: new Date(2026, 0, 1).toISOString()
    });
  });

  it("falls back to the supplied current month for invalid input", () => {
    expect(monthRange("invalid", new Date(2026, 4, 20))).toEqual({
      from: new Date(2026, 4, 1).toISOString(),
      to: new Date(2026, 5, 1).toISOString()
    });
  });

  it("formats the inclusive final day from an exclusive range end", () => {
    const range = monthRange("2024-02");
    const startLabel = new Date(2024, 1, 1).toLocaleDateString([], { month: "short", day: "numeric" });
    const endLabel = new Date(2024, 1, 29).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    expect(formatRange(range.from, range.to)).toBe(`${startLabel} - ${endLabel}`);
  });
});
