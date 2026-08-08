"use client";

import { useMemo, useState } from "react";
import { Bot, Check, Copy, SlidersHorizontal, Sparkles, User } from "lucide-react";
import { MarkdownBlock } from "@/components/markdown-block";
import { TokenBreakdown } from "@/components/token-breakdown";
import { AttachmentList } from "@/components/council-workspace/attachment-list";
import type { LiveRunState } from "@/components/council-workspace/live-run-state";
import {
  formatDate,
  formatDuration,
  normalizeStoredAttachment,
  parseCouncilAnswer
} from "@/components/council-workspace/result-utils";
import type { ThreadPayload } from "@/components/council-workspace/types";
import type { CouncilRunResult } from "@/lib/types";

const PROMPT_SUGGESTIONS = [
  "Stress-test this product idea from investor, user, and engineer perspectives.",
  "Compare three approaches and pick the most practical one.",
  "Find hidden risks in this plan and rewrite it into a stronger version.",
  "Turn this messy question into a crisp decision memo."
];

export function Conversation({
  thread,
  threadLoading,
  run,
  running,
  hasOlderRuns = false,
  loadingOlderRuns = false,
  onLoadOlderRuns,
  onPickPrompt,
  onShowDetails
}: {
  thread: ThreadPayload | null;
  threadLoading: boolean;
  run: LiveRunState;
  running: boolean;
  hasOlderRuns?: boolean;
  loadingOlderRuns?: boolean;
  onLoadOlderRuns?: () => void;
  onPickPrompt: (prompt: string) => void;
  onShowDetails: (runId: string) => void;
}) {
  const latestStatus = run.statusLog.at(-1);

  return (
    <div className="conversation" aria-busy={threadLoading || running}>
      {threadLoading ? (
        <p className="sr-only" role="status" aria-live="polite">
          Loading conversation.
        </p>
      ) : null}
      {!threadLoading && !thread?.runs.length && !run.prompt && !run.result && !running && !run.error ? (
        <EmptyState onPickPrompt={onPickPrompt} />
      ) : null}
      {thread ? (
        <StoredThreadView
          thread={thread}
          hasOlderRuns={hasOlderRuns}
          loadingOlderRuns={loadingOlderRuns}
          onLoadOlderRuns={onLoadOlderRuns}
          onShowDetails={onShowDetails}
          onRetryPrompt={onPickPrompt}
        />
      ) : null}
      {run.prompt ? (
        <Message role="user">
          <MarkdownBlock text={run.prompt} />
          {run.attachments.length ? <AttachmentList attachments={run.attachments} /> : null}
        </Message>
      ) : null}
      {running ? (
        <Message role="assistant" accent>
          <div className="thinking-line" role="status" aria-live="polite" aria-atomic="true">
            <Sparkles aria-hidden size={16} />
            <span>{latestStatus ?? "Working through it."}</span>
          </div>
          <div className="status-log" aria-hidden="true">
            {run.statusLog.map((message, index) => (
              <span key={`${message}-${index}`}>{message}</span>
            ))}
          </div>
          {run.usageEvents.length > 0 && !run.result ? <TokenBreakdown events={run.usageEvents} /> : null}
        </Message>
      ) : null}
      {!running && !run.result && run.error ? (
        <Message role="assistant" accent>
          <div className="error-text" role="alert">{run.error}</div>
          {run.prompt ? (
            <div className="answer-actions">
              <button className="button subtle small" type="button" onClick={() => onPickPrompt(run.prompt)}>
                Retry prompt
              </button>
            </div>
          ) : null}
        </Message>
      ) : null}
      {!running && !run.result && !run.error && run.statusLog.at(-1) === "Council run stopped." ? (
        <Message role="assistant" accent>
          <p className="muted" role="status">Council run stopped.</p>
          {run.prompt ? (
            <div className="answer-actions">
              <button className="button subtle small" type="button" onClick={() => onPickPrompt(run.prompt)}>
                Retry prompt
              </button>
            </div>
          ) : null}
        </Message>
      ) : null}
      {run.result ? (
        <ActiveResult result={run.result} onShowDetails={() => onShowDetails(run.result!.id)} />
      ) : null}
    </div>
  );
}

function ActiveResult({ result, onShowDetails }: { result: CouncilRunResult; onShowDetails: () => void }) {
  return (
    <Message role="assistant">
      <div className="answer-header">
        <div className="assistant-name">
          <Bot aria-hidden size={16} />
          AI Council
        </div>
        <div className="pill-row">
          <span className="pill">{result.savedMode ? "Saved" : "Ephemeral"}</span>
          <span className="pill">{formatDuration(result.latencyMs)}</span>
          <span className="pill">{result.models.length} models</span>
        </div>
      </div>
      <FormattedAnswer finalAnswer={result.finalAnswer} />
      <div className="answer-actions">
        <CopyAnswerButton text={result.finalAnswer} />
        <RunDetailsButton onClick={onShowDetails} />
      </div>
    </Message>
  );
}

function StoredThreadView({
  thread,
  hasOlderRuns,
  loadingOlderRuns,
  onLoadOlderRuns,
  onShowDetails,
  onRetryPrompt
}: {
  thread: ThreadPayload;
  hasOlderRuns?: boolean;
  loadingOlderRuns?: boolean;
  onLoadOlderRuns?: () => void;
  onShowDetails: (runId: string) => void;
  onRetryPrompt: (prompt: string) => void;
}) {
  return (
    <div className="stored-thread" aria-label={thread.thread.title}>
      {hasOlderRuns ? (
        <div className="load-older-wrap">
          <button
            className="button subtle small"
            type="button"
            disabled={loadingOlderRuns}
            onClick={onLoadOlderRuns}
          >
            {loadingOlderRuns ? "Loading earlier messages…" : "Load earlier messages"}
          </button>
        </div>
      ) : null}
      {thread.runs.map((run) => {
        const failed = run.status === "failed" || run.status === "running" || run.status === "queued";
        const failedComplete = run.status === "failed";
        return (
          <div className="turn-pair" key={run.id}>
            <Message role="user">
              <MarkdownBlock text={run.prompt_text ?? undefined} empty="Ephemeral prompt" />
              {run.attachments?.length ? (
                <AttachmentList attachments={run.attachments.map(normalizeStoredAttachment)} />
              ) : null}
            </Message>
            <Message role="assistant" accent={failedComplete}>
              <div className="answer-header">
                <div className="assistant-name">
                  <Bot aria-hidden size={16} />
                  AI Council
                </div>
                <div className="pill-row">
                  <span className="pill">{formatDate(run.created_at)}</span>
                  {failedComplete ? <span className="pill pill-danger">Run failed</span> : null}
                  {run.status === "running" || run.status === "queued" ? (
                    <span className="pill">Incomplete</span>
                  ) : null}
                </div>
              </div>
              {failedComplete ? (
                <div className="error-text" role="status">
                  {run.error_message || "This council run failed before a final answer was saved."}
                </div>
              ) : failed && !run.final_answer ? (
                <p className="muted">This run did not finish.</p>
              ) : (
                <FormattedAnswer finalAnswer={run.final_answer ?? ""} />
              )}
              <div className="answer-actions">
                {run.final_answer ? <CopyAnswerButton text={run.final_answer} /> : null}
                {failedComplete && run.prompt_text ? (
                  <button
                    className="button subtle small"
                    type="button"
                    onClick={() => onRetryPrompt(run.prompt_text ?? "")}
                  >
                    Retry prompt
                  </button>
                ) : null}
                <RunDetailsButton onClick={() => onShowDetails(run.id)} />
              </div>
            </Message>
          </div>
        );
      })}
    </div>
  );
}

function FormattedAnswer({ finalAnswer }: { finalAnswer: string }) {
  const { mainAnswer, consensus, disagreements, blindSpots } = useMemo(
    () => parseCouncilAnswer(finalAnswer),
    [finalAnswer]
  );

  return (
    <div className="council-answer">
      <div className="council-answer-main">
        <MarkdownBlock text={mainAnswer} />
      </div>
      {consensus || disagreements.length || blindSpots.length ? (
        <div className="council-meta-grid">
          {consensus ? (
            <div className="council-meta-section">
              <h3>Consensus</h3>
              <MarkdownBlock text={consensus} />
            </div>
          ) : null}
          {disagreements.length ? (
            <div className="council-meta-section">
              <h3>Disagreements</h3>
              <ul>
                {disagreements.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            </div>
          ) : null}
          {blindSpots.length ? (
            <div className="council-meta-section">
              <h3>Blind spots</h3>
              <ul>
                {blindSpots.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CopyAnswerButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="button subtle small" type="button" onClick={() => void handleCopy()}>
      {copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
      {copied ? "Copied" : "Copy answer"}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Answer copied to clipboard." : ""}
      </span>
    </button>
  );
}

function RunDetailsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="button subtle small run-details-button"
      type="button"
      onClick={onClick}
    >
      <SlidersHorizontal aria-hidden size={14} />
      Run details
    </button>
  );
}

function Message({
  role,
  accent = false,
  children
}: {
  role: "user" | "assistant";
  accent?: boolean;
  children: React.ReactNode;
}) {
  const Icon = role === "user" ? User : Bot;
  return (
    <article className={`message-row ${role === "user" ? "message-row-user" : "message-row-assistant"} ${accent ? "accent" : ""}`}>
      <div className="message-avatar" aria-hidden>
        <Icon size={16} />
      </div>
      <div className="message-content">{children}</div>
    </article>
  );
}

function EmptyState({ onPickPrompt }: { onPickPrompt: (prompt: string) => void }) {
  return (
    <section className="empty-state">
      <div className="empty-mark">
        <Sparkles aria-hidden size={22} />
      </div>
      <h2>What are we deciding?</h2>
      <div className="quick-prompts">
        {PROMPT_SUGGESTIONS.map((suggestion) => (
          <button className="suggestion-button" key={suggestion} type="button" onClick={() => onPickPrompt(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
