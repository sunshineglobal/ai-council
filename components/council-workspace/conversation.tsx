"use client";

import { useMemo } from "react";
import { Bot, SlidersHorizontal, Sparkles, User } from "lucide-react";
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
  onPickPrompt,
  onShowDetails
}: {
  thread: ThreadPayload | null;
  threadLoading: boolean;
  run: LiveRunState;
  running: boolean;
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
      {thread ? <StoredThreadView thread={thread} onShowDetails={onShowDetails} /> : null}
      {run.prompt ? (
        <Message role="user">
          <MarkdownBlock text={run.prompt} />
          {run.attachments.length ? <AttachmentList attachments={run.attachments} /> : null}
        </Message>
      ) : null}
      {running || (run.statusLog.length > 0 && !run.result) ? (
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
      {run.error ? (
        <Message role="assistant" accent>
          <div className="error-text" role="alert">{run.error}</div>
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
      <RunDetailsButton onClick={onShowDetails} />
    </Message>
  );
}

function StoredThreadView({
  thread,
  onShowDetails
}: {
  thread: ThreadPayload;
  onShowDetails: (runId: string) => void;
}) {
  return (
    <div className="stored-thread" aria-label={thread.thread.title}>
      {thread.runs.map((run) => (
        <div className="turn-pair" key={run.id}>
          <Message role="user">
            <MarkdownBlock text={run.prompt_text ?? undefined} empty="Ephemeral prompt" />
            {run.attachments?.length ? (
              <AttachmentList attachments={run.attachments.map(normalizeStoredAttachment)} />
            ) : null}
          </Message>
          <Message role="assistant">
            <div className="answer-header">
              <div className="assistant-name">
                <Bot aria-hidden size={16} />
                AI Council
              </div>
              <span className="pill">{formatDate(run.created_at)}</span>
            </div>
            <FormattedAnswer finalAnswer={run.final_answer ?? ""} />
            <RunDetailsButton onClick={() => onShowDetails(run.id)} />
          </Message>
        </div>
      ))}
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
