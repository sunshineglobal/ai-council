import type { RefObject } from "react";
import { RunTrace } from "@/components/run-trace";
import { TokenBreakdown } from "@/components/token-breakdown";
import { formatDuration, modelLabel } from "@/components/council-workspace/result-utils";
import type { CouncilRunResult, ModelOption } from "@/lib/types";

export function ActivityPanel({
  result,
  models,
  running,
  statusLog,
  activityEndRef
}: {
  result: CouncilRunResult | null;
  models: ModelOption[];
  running: boolean;
  statusLog: string[];
  activityEndRef: RefObject<HTMLDivElement>;
}) {
  return (
    <aside className="activity-pane" aria-label="Council activity">
      <div className="activity-header">
        <div>
          <h2>Run Details &amp; Trace</h2>
          <p className="muted" role="status" aria-live="polite">
            {running ? "Running..." : result ? "Complete" : "Waiting"}
          </p>
        </div>
      </div>
      <div className="activity-scroll">
        {result ? (
          <div className="activity-section">
            <h3 className="activity-section-title">Configuration</h3>
            <div className="pill-row compact-spacing">
              <span className="pill">Judge: {modelLabel(models, result.judgeModel)}</span>
              <span className="pill">Debate: {result.debateDepth} {result.debateDepth === 1 ? "round" : "rounds"}</span>
              {result.researchEnabled ? <span className="pill">Research</span> : null}
            </div>
            <div className="pill-row compact-spacing">
              <span className="pill">Models:</span>
              {result.models.map((modelId) => (
                <span className="pill" key={modelId}>{modelLabel(models, modelId)}</span>
              ))}
            </div>
            {result.latencyMs > 0 ? (
              <div className="pill-row compact-spacing">
                <span className="pill">Latency: {formatDuration(result.latencyMs)}</span>
                <span className="pill">Cost: ${result.costEstimate.toFixed(6)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {statusLog.length > 0 && running ? (
          <div className="activity-section">
            <h3 className="activity-section-title">Progress</h3>
            <div className="status-log" aria-hidden="true">
              {statusLog.map((message, index) => (
                <span key={`${message}-${index}`}>{message}</span>
              ))}
            </div>
          </div>
        ) : null}

        {result && result.usageEvents.length > 0 ? (
          <div className="activity-section">
            <TokenBreakdown
              totals={result.tokenTotals}
              events={result.usageEvents}
              costEstimate={result.costEstimate}
            />
          </div>
        ) : null}

        {result ? (
          <div className="activity-section">
            <h3 className="activity-section-title">Debate trace</h3>
            <RunTrace result={result} />
          </div>
        ) : (
          <p className="muted small text-center activity-empty">
            No active run or details selected. Start a run or click &quot;Run details&quot; in chat to view progress.
          </p>
        )}
        <div ref={activityEndRef} />
      </div>
    </aside>
  );
}
