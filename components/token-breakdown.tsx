"use client";

import type { TokenTotals, UsageEvent } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { summarizeUsage } from "@/lib/token-usage";

export function TokenBreakdown({
  totals,
  events,
  costEstimate = 0
}: {
  totals?: TokenTotals;
  events?: UsageEvent[];
  costEstimate?: number;
}) {
  const computed = normalizeTotals(totals ?? summarizeUsage(events ?? []));

  return (
    <section className="panel">
      <h2>Token usage</h2>
      <div className="metric-grid">
        <div className="metric">
          <span>Prompt tokens</span>
          <strong>{formatNumber(computed.promptTokens)}</strong>
        </div>
        <div className="metric">
          <span>Completion tokens</span>
          <strong>{formatNumber(computed.completionTokens)}</strong>
        </div>
        <div className="metric">
          <span>Total tokens</span>
          <strong>{formatNumber(computed.totalTokens)}</strong>
        </div>
      </div>
      <div className="pill-row" style={{ marginTop: 10 }}>
        {computed.estimated ? <span className="pill">Some usage estimated</span> : null}
        <span className="pill">Estimated cost {formatCurrency(costEstimate)}</span>
      </div>
      <UsageTable title="By stage" rows={computed.byStage} />
      <UsageTable title="By model" rows={computed.byModel} />
    </section>
  );
}

function normalizeTotals(totals: Partial<TokenTotals>): TokenTotals {
  return {
    promptTokens: totals.promptTokens ?? 0,
    completionTokens: totals.completionTokens ?? 0,
    totalTokens: totals.totalTokens ?? 0,
    estimated: totals.estimated,
    byStage: totals.byStage ?? {},
    byModel: totals.byModel ?? {}
  };
}

function UsageTable({ title, rows }: { title: string; rows: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number }> }) {
  const entries = Object.entries(rows);

  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <h3>{title}</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Prompt</th>
            <th>Completion</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, usage]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{formatNumber(usage.promptTokens)}</td>
              <td>{formatNumber(usage.completionTokens)}</td>
              <td>{formatNumber(usage.totalTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
