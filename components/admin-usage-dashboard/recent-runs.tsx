import type { RecentCouncilRun } from "@/lib/admin/usage-types";
import { formatCurrency, formatNumber } from "@/lib/format";

export function RecentRuns({ runs }: { runs: RecentCouncilRun[] }) {
  return (
    <section>
      <h3>Recent council runs</h3>
      {runs.length === 0 ? (
        <p className="muted small">No council runs in this month.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <caption className="sr-only">Recent council runs</caption>
            <thead>
              <tr>
                <th scope="col">Prompt</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col">Models</th>
                <th scope="col">Tokens</th>
                <th scope="col">Cost</th>
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
