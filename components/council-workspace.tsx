"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Bot, FileText, History, Loader2, PanelLeft, Paperclip, Plus, Search, Send, Settings2, SlidersHorizontal, Sparkles, User, X } from "lucide-react";
import { MarkdownBlock } from "@/components/markdown-block";
import { RunTrace } from "@/components/run-trace";
import { TokenBreakdown } from "@/components/token-breakdown";
import { parseCouncilStreamBlock } from "@/lib/sse";
import type { CouncilAttachment, CouncilEvent, CouncilRunResult, ModelOption, TokenTotals, UsageEvent } from "@/lib/types";

type ChatSummary = {
  id: string;
  title: string;
  updated_at: string;
};

type StoredRun = {
  id: string;
  prompt_text: string | null;
  final_answer: string | null;
  token_totals: TokenTotals;
  created_at: string;
  models: string[];
  judge_model: string;
  debate_depth: number;
  research_enabled: boolean;
  attachments?: StoredAttachment[];
};

type ThreadPayload = {
  thread: { id: string; title: string };
  runs: StoredRun[];
};

type StoredAttachment = {
  id: string;
  filename: string;
  content_type?: string | null;
  contentType?: string;
  file_size?: number;
  fileSize?: number;
  text_preview?: string | null;
  textPreview?: string;
  extraction_status?: CouncilAttachment["extractionStatus"];
  extractionStatus?: CouncilAttachment["extractionStatus"];
  created_at?: string;
  createdAt?: string;
};

const MAX_ATTACHMENTS = 5;
const FILE_ACCEPT = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".sql",
  ".log",
  "text/*",
  "application/json"
].join(",");

export function CouncilWorkspace({
  defaultSaveHistory,
  initialThreadId
}: {
  defaultSaveHistory: boolean;
  initialThreadId?: string;
}) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [judgeModel, setJudgeModel] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [prompt, setPrompt] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [saveHistory, setSaveHistory] = useState(defaultSaveHistory);
  const [debateDepth, setDebateDepth] = useState(2);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [result, setResult] = useState<CouncilRunResult | null>(null);
  const [attachments, setAttachments] = useState<CouncilAttachment[]>([]);
  const [activeAttachments, setActiveAttachments] = useState<CouncilAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deferredModelFilter = useDeferredValue(modelFilter);

  useEffect(() => {
    void loadModels();
    void loadChats();
  }, []);

  useEffect(() => {
    setResult(null);
    setError("");
    setStatusLog([]);
    setUsageEvents([]);
    setActivePrompt("");
    setActiveAttachments([]);
    setUploadError("");

    if (initialThreadId) {
      void loadThread(initialThreadId);
      return;
    }

    setThread(null);
  }, [initialThreadId]);

  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 190)}px`;
  }, [prompt]);

  const filteredModels = useMemo(() => {
    const query = deferredModelFilter.trim().toLowerCase();
    if (!query) return models.slice(0, 80);
    return models.filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(query)).slice(0, 80);
  }, [deferredModelFilter, models]);

  const activeTitle = thread?.thread.title || compactTitle(activePrompt || result?.prompt || prompt) || "AI Council";
  const latestStatus = statusLog.at(-1);
  const canSubmit = Boolean(prompt.trim() && selectedModels.length > 0 && judgeModel && !running && !uploading);
  const canAttachMore = attachments.length < MAX_ATTACHMENTS && !running && !uploading;
  const selectedModelLabels = useMemo(
    () => selectedModels.map((modelId) => ({ id: modelId, label: modelLabel(models, modelId) })),
    [models, selectedModels]
  );

  async function loadModels() {
    const response = await fetch("/api/models");
    if (!response.ok) return;
    const body = (await response.json()) as { models: ModelOption[] };
    setModels(body.models);
    setSelectedModels((current) => (current.length ? current : body.models.slice(0, 3).map((model) => model.id)));
    setJudgeModel((current) => current || body.models[0]?.id || "");
  }

  async function loadChats() {
    const response = await fetch("/api/chats");
    if (!response.ok) return;
    const body = (await response.json()) as { chats: ChatSummary[] };
    setChats(body.chats);
  }

  async function loadThread(threadId: string) {
    const response = await fetch(`/api/chats/${threadId}`);
    if (!response.ok) return;
    const body = (await response.json()) as ThreadPayload;
    setThread(body);
  }

  function toggleModel(modelId: string) {
    setSelectedModels((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      if (current.length >= 8) return current;
      return [...current, modelId];
    });
  }

  async function uploadFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selectedFiles.length) return;

    if (attachments.length + selectedFiles.length > MAX_ATTACHMENTS) {
      setUploadError(`Attach at most ${MAX_ATTACHMENTS} files.`);
      return;
    }

    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append("files", file));
    formData.append("saveHistory", String(saveHistory));

    try {
      const response = await fetch("/api/files", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error(await readResponseError(response));
      }

      const body = (await response.json()) as { files: CouncilAttachment[] };
      setAttachments((current) => [...current, ...body.files].slice(0, MAX_ATTACHMENTS));
    } catch (fileError) {
      setUploadError(fileError instanceof Error ? fileError.message : "File upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(fileId: string) {
    const removed = attachments.find((attachment) => attachment.id === fileId);
    setAttachments((current) => current.filter((attachment) => attachment.id !== fileId));
    setUploadError("");

    try {
      const response = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readResponseError(response));
      }
    } catch (fileError) {
      if (removed) setAttachments((current) => [...current, removed]);
      setUploadError(fileError instanceof Error ? fileError.message : "Could not remove file.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || selectedModels.length === 0 || !judgeModel) return;
    const queuedAttachments = attachments;

    setRunning(true);
    setError("");
    setResult(null);
    setActivePrompt(trimmedPrompt);
    setActiveAttachments(queuedAttachments);
    setUploadError("");
    setPrompt("");
    window.requestAnimationFrame(() => promptRef.current?.focus());
    setUsageEvents([]);
    setStatusLog(["Starting council run."]);

    try {
      const response = await fetch("/api/council/runs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          models: selectedModels,
          judgeModel,
          debateDepth,
          researchEnabled,
          saveHistory,
          threadId: saveHistory ? initialThreadId : undefined,
          attachmentIds: queuedAttachments.map((attachment) => attachment.id)
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(await readResponseError(response));
      }

      setAttachments([]);
      const finished = await readEventStream(response.body);
      if (!finished) {
        throw new Error("Council stream ended before a final result arrived. Check the Vercel runtime logs for the server error.");
      }
      if (saveHistory) {
        await loadChats();
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Council request failed.");
    } finally {
      setRunning(false);
    }
  }

  async function readEventStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawTerminalEvent = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const event = parseCouncilStreamBlock(block);
        if (!event) continue;
        if (event.type === "complete" || event.type === "error") sawTerminalEvent = true;
        handleCouncilEvent(event);
      }
    }

    if (buffer.trim()) {
      const event = parseCouncilStreamBlock(buffer);
      if (event) {
        if (event.type === "complete" || event.type === "error") sawTerminalEvent = true;
        handleCouncilEvent(event);
      }
    }

    return sawTerminalEvent;
  }

  async function readResponseError(response: Response) {
    const text = await response.text().catch(() => "");
    if (!text) return `Council request failed with status ${response.status}.`;

    try {
      const body = JSON.parse(text) as { error?: string };
      return body.error ?? `Council request failed with status ${response.status}.`;
    } catch {
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
      return preview || `Council request failed with status ${response.status}.`;
    }
  }

  function handleCouncilEvent(event: CouncilEvent) {
    if (event.type === "stage") {
      setStatusLog((current) => [...current, event.message]);
    }
    if (event.type === "research") {
      setStatusLog((current) => [...current, `Found ${event.research.sources.length} Firecrawl sources.`]);
    }
    if (event.type === "usage") {
      setUsageEvents((current) => [...current, event.usage]);
    }
    if (event.type === "complete") {
      setResult(event.result);
      setStatusLog((current) => [...current, "Council run complete."]);
    }
    if (event.type === "error") {
      setError(event.message);
    }
  }

  return (
    <main className={`workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar" aria-label="Chat history">
        <div className="sidebar-top">
          <Link className="new-chat-button" href="/app" prefetch={false}>
            <Plus size={16} />
            New chat
          </Link>
          <button className="icon-button ghost" type="button" title="Hide sidebar" onClick={() => setSidebarOpen(false)}>
            <PanelLeft size={18} />
          </button>
        </div>

        <div className="section-title compact">
          <h2>Chats</h2>
          <History size={15} />
        </div>
        <div className="chat-list">
          {chats.length === 0 ? <p className="muted small">Saved chats appear here.</p> : null}
          {chats.map((chat) => (
            <Link
              aria-current={initialThreadId === chat.id ? "page" : undefined}
              className={`chat-link ${initialThreadId === chat.id ? "active" : ""}`}
              href={`/app/chats/${chat.id}`}
              key={chat.id}
              prefetch={false}
            >
              <strong>{chat.title}</strong>
              <span>{formatDate(chat.updated_at)}</span>
            </Link>
          ))}
        </div>
      </aside>

      <section className="main-pane chat-pane">
        <header className="chat-header">
          <div className="chat-title-group">
            {!sidebarOpen ? (
              <button className="icon-button ghost" type="button" title="Show sidebar" onClick={() => setSidebarOpen(true)}>
                <PanelLeft size={18} />
              </button>
            ) : null}
            <div>
              <h1>{activeTitle}</h1>
              <div className="pill-row">
                <span className="pill">{selectedModels.length} models</span>
                <span className="pill">{debateDepth} rounds</span>
                {researchEnabled ? <span className="pill">Research</span> : null}
              </div>
            </div>
          </div>
          <button className="button subtle" type="button" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={16} />
            Settings
          </button>
        </header>

        <div className="conversation">
          {!thread?.runs.length && !activePrompt && !result && !running && !error ? (
            <EmptyState onPickPrompt={(suggestion) => {
              setPrompt(suggestion);
              window.requestAnimationFrame(() => promptRef.current?.focus());
            }} />
          ) : null}
          {thread ? <StoredThreadView thread={thread} /> : null}
          {activePrompt ? (
            <Message role="user">
              <MarkdownBlock text={activePrompt} />
              {activeAttachments.length ? <AttachmentList attachments={activeAttachments} /> : null}
            </Message>
          ) : null}
          {running || (statusLog.length > 0 && !result) ? (
            <Message role="assistant" accent>
              <div className="thinking-line">
                <Sparkles size={16} />
                <span>{latestStatus ?? "Working through it."}</span>
              </div>
              <div className="status-log">
                {statusLog.map((message, index) => (
                  <span key={`${message}-${index}`}>{message}</span>
                ))}
              </div>
              {usageEvents.length > 0 && !result ? <TokenBreakdown events={usageEvents} /> : null}
            </Message>
          ) : null}
          {error ? (
            <Message role="assistant" accent>
              <div className="error-text">{error}</div>
            </Message>
          ) : null}
          {result ? <ActiveResult result={result} /> : null}
        </div>

        <form className="composer" onSubmit={submit}>
          {attachments.length || uploadError ? (
            <div className="composer-attachments">
              {attachments.length ? (
                <AttachmentList attachments={attachments} onRemove={(fileId) => void removeAttachment(fileId)} />
              ) : null}
              {uploadError ? <div className="error-text small">{uploadError}</div> : null}
            </div>
          ) : null}
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask the council..."
            rows={1}
          />
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            multiple
            accept={FILE_ACCEPT}
            onChange={(event) => void uploadFiles(event)}
          />
          <div className="composer-footer">
            <div className="composer-meta">
              <span>{judgeModel ? modelLabel(models, judgeModel) : "Choose a judge"}</span>
              <span>{saveHistory ? "Saved" : "Ephemeral"}</span>
              {attachments.length ? <span>{attachments.length} attached</span> : null}
              {uploading ? <span>Uploading</span> : null}
            </div>
            <div className="composer-actions">
              <button
                className="icon-button ghost composer-icon-button"
                disabled={!canAttachMore}
                type="button"
                title={uploading ? "Uploading" : "Attach files"}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="spin" size={17} /> : <Paperclip size={17} />}
              </button>
              <button className="send-button" disabled={!canSubmit} type="submit" title={running ? "Running" : "Send"}>
                <Send size={17} />
              </button>
            </div>
          </div>
        </form>
      </section>

      <aside className={`settings-pane ${settingsOpen ? "open" : ""}`} aria-label="Council settings">
        <div className="settings-header">
          <div>
            <h2>Council settings</h2>
            <p className="muted">{selectedModels.length}/8 models selected</p>
          </div>
          <button className="icon-button ghost" type="button" title="Close settings" onClick={() => setSettingsOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-scroll">
          <label className="field">
            <span>Judge model</span>
            <select value={judgeModel} onChange={(event) => setJudgeModel(event.target.value)}>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>

          {selectedModelLabels.length ? (
            <div className="selected-model-strip" aria-label="Selected council models">
              {selectedModelLabels.map((model) => (
                <button className="selected-model-chip" key={model.id} type="button" onClick={() => toggleModel(model.id)}>
                  <span>{model.label}</span>
                  <X size={13} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small">Choose at least one model.</p>
          )}

          <label className="field range-field">
            <span>Debate depth</span>
            <div className="range-row">
              <input min={1} max={4} type="range" value={debateDepth} onChange={(event) => setDebateDepth(Number(event.target.value))} />
              <strong>
                {debateDepth} {debateDepth === 1 ? "round" : "rounds"}
              </strong>
            </div>
          </label>

          <div className="field">
            <span>Run mode</span>
            <label className="switch-row">
              <input checked={researchEnabled} type="checkbox" onChange={(event) => setResearchEnabled(event.target.checked)} />
              <span>Firecrawl research</span>
            </label>
            <label className="switch-row">
              <input checked={saveHistory} type="checkbox" onChange={(event) => setSaveHistory(event.target.checked)} />
              <span>Save history</span>
            </label>
          </div>

          <label className="field">
            <span>Search models</span>
            <span className="input-shell">
              <Search aria-hidden size={16} />
              <input
                value={modelFilter}
                onChange={(event) => setModelFilter(event.target.value)}
                placeholder="openai, claude, llama..."
              />
            </span>
          </label>

          <div className="model-list">
            {filteredModels.map((model) => (
              <label className="model-item" key={model.id}>
                <input checked={selectedModels.includes(model.id)} type="checkbox" onChange={() => toggleModel(model.id)} />
                <span>
                  <strong>{model.name}</strong>
                  <span>{model.id}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </aside>
      {settingsOpen ? <button className="drawer-scrim" type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)} /> : null}
    </main>
  );
}

function ActiveResult({ result }: { result: CouncilRunResult }) {
  return (
    <Message role="assistant">
      <div className="answer-header">
        <div className="assistant-name">
          <Bot size={16} />
          AI Council
        </div>
        <div className="pill-row">
          <span className="pill">{result.savedMode ? "Saved" : "Ephemeral"}</span>
          <span className="pill">{result.latencyMs}ms</span>
        </div>
      </div>
      <MarkdownBlock text={result.finalAnswer} />
      <details className="trace run-details">
        <summary>
          <span>
            <SlidersHorizontal size={16} />
            Run details
          </span>
          <span className="pill">{result.models.length} models</span>
        </summary>
        <div className="trace-body stack">
          <TokenBreakdown totals={result.tokenTotals} events={result.usageEvents} costEstimate={result.costEstimate} />
          <RunTrace result={result} />
        </div>
      </details>
    </Message>
  );
}

function StoredThreadView({ thread }: { thread: ThreadPayload }) {
  return (
    <div className="stored-thread" aria-label={thread.thread.title}>
      {thread.runs.map((run) => (
        <div className="turn-pair" key={run.id}>
          <Message role="user">
            <MarkdownBlock text={run.prompt_text ?? undefined} empty="Ephemeral prompt" />
            {run.attachments?.length ? <AttachmentList attachments={run.attachments.map(normalizeStoredAttachment)} /> : null}
          </Message>
          <Message role="assistant">
            <div className="answer-header">
              <div className="assistant-name">
                <Bot size={16} />
                AI Council
              </div>
              <span className="pill">{formatDate(run.created_at)}</span>
            </div>
            <MarkdownBlock text={run.final_answer ?? undefined} empty="No saved final answer." />
            <details className="trace run-details">
              <summary>
                <span>
                  <SlidersHorizontal size={16} />
                  Run details
                </span>
                <span className="pill">{run.models.length} models</span>
              </summary>
              <div className="trace-body stack">
                <TokenBreakdown totals={run.token_totals} />
                <div className="pill-row">
                  <span className="pill">judge {run.judge_model}</span>
                  <span className="pill">
                    {run.debate_depth} {run.debate_depth === 1 ? "round" : "rounds"}
                  </span>
                  {run.research_enabled ? <span className="pill">Firecrawl research</span> : null}
                </div>
              </div>
            </details>
          </Message>
        </div>
      ))}
    </div>
  );
}

function AttachmentList({
  attachments,
  onRemove
}: {
  attachments: CouncilAttachment[];
  onRemove?: (fileId: string) => void;
}) {
  return (
    <div className="attachment-list" aria-label="Attached files">
      {attachments.map((attachment) => (
        <div className="attachment-item" key={attachment.id}>
          <FileText size={15} />
          <span className="attachment-copy">
            <strong>{attachment.filename}</strong>
            <span>
              {formatBytes(attachment.fileSize)}
              {attachment.extractionStatus === "ready" || attachment.extractionStatus === "too_large"
                ? " text"
                : ` ${attachment.extractionStatus}`}
            </span>
          </span>
          {onRemove ? (
            <button
              className="icon-button ghost attachment-remove"
              type="button"
              title={`Remove ${attachment.filename}`}
              onClick={() => onRemove(attachment.id)}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Message({ role, accent = false, children }: { role: "user" | "assistant"; accent?: boolean; children: React.ReactNode }) {
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

const PROMPT_SUGGESTIONS = [
  "Stress-test this product idea from investor, user, and engineer perspectives.",
  "Compare three approaches and pick the most practical one.",
  "Find hidden risks in this plan and rewrite it into a stronger version.",
  "Turn this messy question into a crisp decision memo."
];

function EmptyState({ onPickPrompt }: { onPickPrompt: (prompt: string) => void }) {
  return (
    <section className="empty-state">
      <div className="empty-mark">
        <Sparkles size={22} />
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

function compactTitle(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length > 52 ? `${trimmed.slice(0, 49)}...` : trimmed;
}

function modelLabel(models: ModelOption[], modelId: string) {
  return models.find((model) => model.id === modelId)?.name ?? modelId;
}

function normalizeStoredAttachment(attachment: StoredAttachment): CouncilAttachment {
  return {
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.contentType ?? attachment.content_type ?? "application/octet-stream",
    fileSize: Number(attachment.fileSize ?? attachment.file_size ?? 0),
    textPreview: attachment.textPreview ?? attachment.text_preview ?? undefined,
    extractionStatus: attachment.extractionStatus ?? attachment.extraction_status ?? "none",
    createdAt: attachment.createdAt ?? attachment.created_at ?? ""
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
