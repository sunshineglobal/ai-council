"use client";

import Link from "next/link";
import { CalendarDays, RefreshCw, Save } from "lucide-react";
import { BudgetBanner } from "@/components/admin-usage-dashboard/budget-banner";
import { formatRange } from "@/components/admin-usage-dashboard/date-utils";
import { RecentRuns } from "@/components/admin-usage-dashboard/recent-runs";
import { useAdminUsage } from "@/components/admin-usage-dashboard/use-admin-usage";
import { UsageSummary } from "@/components/admin-usage-dashboard/usage-summary";
import { UsageTable } from "@/components/admin-usage-dashboard/usage-table";

export function UsageDashboard({
  canEditBudget = false,
  memberId
}: {
  canEditBudget?: boolean;
  memberId?: string;
}) {
  const {
    budgetInput,
    loading,
    month,
    notice,
    refresh,
    saveBudget,
    saving,
    setBudgetInput,
    setMonth,
    usage
  } = useAdminUsage(memberId);

  return (
    <section className="panel stack">
      <div className="usage-header">
        <div>
          <h2>{usage?.subject ? `Usage · ${usage.subject.email}` : "Monthly spend"}</h2>
          <p className="muted small">
            {usage ? formatRange(usage.range.from, usage.range.to) : "Loading current month."}
            {memberId ? (
              <>
                {" "}
                <Link className="link-button" href="/app/usage">Your usage</Link>
              </>
            ) : null}
          </p>
        </div>
        <button
          className="button subtle"
          type="button"
          onClick={refresh}
          disabled={loading || !month}
        >
          <RefreshCw aria-hidden size={16} />
          Refresh
        </button>
      </div>

      {canEditBudget ? (
        <form className="form-row" onSubmit={saveBudget}>
          <MonthField month={month} onMonthChange={setMonth} />
          <label className="field">
            <span>Monthly budget</span>
            <input
              min={0}
              step="0.000001"
              type="number"
              value={budgetInput}
              onChange={(event) => setBudgetInput(event.target.value)}
              placeholder="No budget"
            />
          </label>
          <button className="button primary" type="submit" disabled={saving}>
            <Save aria-hidden size={16} />
            {saving ? "Saving" : "Save"}
          </button>
        </form>
      ) : (
        <div className="form-row">
          <MonthField month={month} onMonthChange={setMonth} />
        </div>
      )}

      {notice ? (
        <p className={notice.kind === "error" ? "error-text" : "success-text"} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}

      {usage ? (
        <>
          <BudgetBanner usage={usage} />
          <UsageSummary usage={usage} />
          <UsageTable title="By model" rows={usage.byModel} />
          <UsageTable title="By stage" rows={usage.byStage} />
          <RecentRuns runs={usage.recentRuns} linkToChats={!memberId} />
        </>
      ) : loading ? (
        <p className="muted small">Loading usage.</p>
      ) : null}
    </section>
  );
}

export { UsageDashboard as AdminUsageDashboard };

function MonthField({
  month,
  onMonthChange
}: {
  month: string;
  onMonthChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>Month</span>
      <span className="input-shell">
        <CalendarDays aria-hidden size={16} />
        <input
          type="month"
          value={month}
          onChange={(event) => onMonthChange(event.target.value)}
        />
      </span>
    </label>
  );
}
