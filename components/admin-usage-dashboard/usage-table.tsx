import { formatCurrency, formatNumber } from "@/lib/format";
import type { UsageBreakdownRow } from "@/lib/usage";

export function UsageTable({ title, rows }: { title: string; rows: UsageBreakdownRow[] }) {
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
          <caption className="sr-only">{title} usage</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Events</th>
              <th scope="col">Prompt</th>
              <th scope="col">Completion</th>
              <th scope="col">Total</th>
              <th scope="col">Cost</th>
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
