"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { PanelRightClose, X } from "lucide-react";
import { RunTrace } from "@/components/run-trace";
import { TokenBreakdown } from "@/components/token-breakdown";
import { formatDuration, modelLabel } from "@/components/council-workspace/result-utils";
import type { CouncilRunResult, ModelOption } from "@/lib/types";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function ActivityPanel({
  result,
  models,
  running,
  statusLog,
  open,
  modal = false,
  activityEndRef,
  onClose
}: {
  result: CouncilRunResult | null;
  models: ModelOption[];
  running: boolean;
  statusLog: string[];
  open: boolean;
  modal?: boolean;
  activityEndRef: RefObject<HTMLDivElement>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !modal) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, [modal, open]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!modal || !open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <aside
      ref={panelRef}
      id="council-activity-panel"
      aria-hidden={!open}
      aria-labelledby="council-activity-title"
      aria-modal={modal || undefined}
      className={`activity-pane ${open ? "open" : "collapsed"}`}
      inert={!open}
      role={modal ? "dialog" : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="activity-header">
        <div>
          <h2 id="council-activity-title">Run Details &amp; Trace</h2>
          <p className="muted" role="status" aria-live="polite">
            {running ? "Running..." : result ? "Complete" : "Waiting"}
          </p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Hide run details"
          className="icon-button ghost"
          type="button"
          title="Hide run details"
          onClick={onClose}
        >
          <span className="activity-close-desktop">
            <PanelRightClose aria-hidden size={18} />
          </span>
          <span className="activity-close-mobile">
            <X aria-hidden size={18} />
          </span>
        </button>
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
