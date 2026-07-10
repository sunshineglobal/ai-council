import type { AdminUsageResponse } from "@/lib/admin/usage-types";
import { formatCurrency, formatNumber } from "@/lib/format";

export function UsageSummary({ usage }: { usage: AdminUsageResponse }) {
  return (
    <>
      <div className="metric-grid">
        <Metric label="Estimated cost" value={formatCurrency(usage.totals.estimatedCost)} />
        <Metric label="Total tokens" value={formatNumber(usage.totals.totalTokens)} />
        <Metric label="Usage events" value={formatNumber(usage.totals.eventCount)} />
        <Metric label="Eval runs" value={formatNumber(usage.totals.evalCount)} />
        <Metric label="Firecrawl credits" value={formatDecimal(usage.totals.firecrawlCredits)} />
        <Metric label="Firecrawl results" value={formatNumber(usage.totals.firecrawlResults)} />
      </div>
      {usage.totals.estimated ? <span className="pill">Some token counts are estimated</span> : null}
    </>
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

function formatDecimal(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 4
  }).format(value);
}
