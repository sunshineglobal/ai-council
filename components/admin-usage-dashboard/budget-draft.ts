export type BudgetDraftState = {
  value: string;
  syncedValue: string;
};

export type BudgetDraftAction =
  | { type: "edit"; value: string }
  | { type: "loaded"; monthlyBudgetUsd: number | null }
  | {
      type: "saved";
      monthlyBudgetUsd: number | null;
      submittedValue: string;
    };

export const initialBudgetDraftState: BudgetDraftState = {
  value: "",
  syncedValue: ""
};

export function budgetDraftReducer(
  state: BudgetDraftState,
  action: BudgetDraftAction
): BudgetDraftState {
  if (action.type === "edit") {
    return { ...state, value: action.value };
  }

  const syncedValue = formatBudgetInput(action.monthlyBudgetUsd);
  if (action.type === "loaded") {
    return {
      value: state.value === state.syncedValue ? syncedValue : state.value,
      syncedValue
    };
  }

  return state.value === action.submittedValue
    ? { value: syncedValue, syncedValue }
    : { ...state, syncedValue };
}

function formatBudgetInput(monthlyBudgetUsd: number | null): string {
  return monthlyBudgetUsd === null ? "" : String(monthlyBudgetUsd);
}
