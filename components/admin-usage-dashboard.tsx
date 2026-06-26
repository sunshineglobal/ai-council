"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, RefreshCw, Save, WalletCards } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";

type BudgetStatus = "unset" | "ok" | "warning" | "over";

type BreakdownRow = {
  name: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated?: boolean;
  eventCount: number;
  latencyMs: number;
  estimatedCost: number;
};

type RecentRun = {
  id: string;
  prompt: string | null;
  status: string;
  createdAt: string;
  models: string[];
  judgeModel: string;
  debateDepth: number;
  researchEnabled: boolean;
  latencyMs: number;
  totalTokens: number;
  estimatedCost: number;
};

type UsageResponse = {
  range: { from: string; to: string };
  budget: {
    monthlyBudgetUsd: number | null;
    status: BudgetStatus;
    percentUsed: number | null;
    remainingUsd: number | null;
  };
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimated?: boolean;
    estimatedCost: number;
    eventCount: number;
    latencyMs: number;
    evalCount: number;
    firecrawlCredits: number;
    firecrawlResults: number;
  };
  byStage: BreakdownRow[];
  byModel: BreakdownRow[];
  recentRuns: RecentRun[];
};

export function AdminUsageDashboard() {
  const [month, setMonth] = useState(currentMonthValue());
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const range = useMemo(() => monthRange(month), [month]);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ from: range.from, to: range.to });
    const response = await fetch(`/api/admin/usage?${params.toString()}`);
    const body = (await response.json().catch(() => ({}))) as UsageResponse & { error?: string };
    if (!response.ok) {
      setMessage(body.error ?? "Could not load usage.");
      setLoading(false);
      return;
    }

    setUsage(body);
    setBudgetInput(body.budget.monthlyBudgetUsd === null ? "" : String(body.budget.monthlyBudgetUsd));
    setLoading(false);
  }, [range.from, range.to]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  async function saveBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const trimmed = budgetInput.trim();
    const monthlyBudgetUsd = trimmed ? Number(trimmed) : null;
    if (monthlyBudgetUsd !== null && (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0)) {
      setMessage("Enter a valid non-negative monthly budget.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/usage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyBudgetUsd })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(body.error ?? "Could not save budget.");
      setSaving(false);
      return;
    }

    setMessage("Budget saved.");
    setSaving(false);
    await loadUsage();
  }

  return (
    <section className="panel stack">
      <div className="usage-header">
        <div>
          <h2>Usage</h2>
          <p className="muted small">{usage ? formatRange(usage.range.from, usage.range.to) : "Loading current month."}</p>
        </div>
        <button className="button subtle" type="button" onClick={loadUsage} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <form className="form-row" onSubmit={saveBudget}>
        <label className="field">
          <span>Month</span>
          <span className="input-shell">
            <CalendarDays aria-hidden size={16} />
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </span>
        </label>
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
          <Save size={16} />
          {saving ? "Saving" : "Save"}
        </button>
      </form>

      {message ? <p className={message.includes("Could") || message.includes("valid") ? "error-text" : "success-text"}>{message}</p> : null}

      {usage ? (
        <>
          <BudgetBanner usage={usage} />
          <div className="metric-grid">
            <Metric label="Estimated cost" value={formatCurrency(usage.totals.estimatedCost)} />
            <Metric label="Total tokens" value={formatNumber(usage.totals.totalTokens)} />
            <Metric label="Usage events" value={formatNumber(usage.totals.eventCount)} />
            <Metric label="Eval runs" value={formatNumber(usage.totals.evalCount)} />
            <Metric label="Firecrawl credits" value={formatDecimal(usage.totals.firecrawlCredits)} />
            <Metric label="Firecrawl results" value={formatNumber(usage.totals.firecrawlResults)} />
          </div>
          {usage.totals.estimated ? <span className="pill">Some token counts are estimated</span> : null}
          <UsageTable title="By model" rows={usage.byModel} />
          <UsageTable title="By stage" rows={usage.byStage} />
          <RecentRuns runs={usage.recentRuns} />
        </>
      ) : loading ? (
        <p className="muted small">Loading usage.</p>
      ) : null}
    </section>
  );
}

function BudgetBanner({ usage }: { usage: UsageResponse }) {
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UsageTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <section>
        <h3>{title}</h3>
        <p className="muted small">No usage in this month.</p>
      </section>
    );
  }

  return (
    <section>
      <h3>{title}</h3>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Events</th>
              <th>Prompt</th>
              <th>Completion</th>
              <th>Total</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="usage-name">{row.name}</td>
                <td>{formatNumber(row.eventCount)}</td>
                <td>{formatNumber(row.promptTokens)}</td>
                <td>{formatNumber(row.completionTokens)}</td>
                <td>{formatNumber(row.totalTokens)}</td>
                <td>{formatCurrency(row.estimatedCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentRuns({ runs }: { runs: RecentRun[] }) {
  return (
    <section>
      <h3>Recent council runs</h3>
      {runs.length === 0 ? (
        <p className="muted small">No council runs in this month.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Prompt</th>
                <th>Status</th>
                <th>Created</th>
                <th>Models</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="usage-name">{run.prompt ?? "Ephemeral prompt"}</td>
                  <td>{run.status}</td>
                  <td>{new Date(run.createdAt).toLocaleString()}</td>
                  <td>
                    {run.models.length} + judge
                    <div className="muted small">{run.researchEnabled ? "Research" : "No research"}</div>
                  </td>
                  <td>{formatNumber(run.totalTokens)}</td>
                  <td>{formatCurrency(run.estimatedCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function currentMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(value: string) {
  const [yearValue, monthValue] = value.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const now = new Date();
  const start = Number.isFinite(year) && Number.isFinite(month) ? new Date(year, month - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return {
    from: start.toISOString(),
    to: end.toISOString()
  };
}

function formatRange(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(new Date(to).getTime() - 1);
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${end.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  })}`;
}

function budgetTitle(status: BudgetStatus) {
  if (status === "over") return "Budget exceeded";
  if (status === "warning") return "Approaching budget";
  if (status === "ok") return "Budget on track";
  return "No monthly budget set";
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 4
  }).format(value);
}
