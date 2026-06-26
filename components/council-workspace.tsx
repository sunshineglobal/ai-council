"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Bot, FileText, History, Loader2, PanelLeft, Paperclip, Plus, Search, Send, Settings2, SlidersHorizontal, Sparkles, Square, Trash2, User, X } from "lucide-react";
import { MarkdownBlock } from "@/components/markdown-block";
import { RunTrace } from "@/components/run-trace";
import { TokenBreakdown } from "@/components/token-breakdown";
import { parseCouncilStreamBlock } from "@/lib/sse";
import { summarizeUsage } from "@/lib/token-usage";
import type { CouncilAttachment, CouncilEvent, CouncilRunResult, ModelOption, TokenTotals, UsageEvent, StageResult, CritiqueResult, JudgeResult, ResearchResult, CouncilStage } from "@/lib/types";

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
  latency_ms: number;
};

type ThreadPayload = {
  thread: { id: string; title: string };
  runs: StoredRun[];
  responses: Array<{
    id: string;
    run_id: string;
    model_id: string;
    stage: "initial_answer" | "revision";
    content: string | null;
    token_usage: any;
    latency_ms: number;
    status: "complete" | "error";
    error: string | null;
  }>;
  critiques: Array<{
    id: string;
    run_id: string;
    round_index: number;
    model_id: string;
    content: string | null;
    token_usage: any;
    latency_ms: number;
    status: "complete" | "error";
    error: string | null;
  }>;
  judges: Array<{
    id: string;
    run_id: string;
    judge_model: string;
    rankings: any;
    synthesis: string | null;
    token_usage: any;
    latency_ms: number;
    status: "complete" | "error";
    error: string | null;
  }>;
  research: Array<{
    run_id: string;
    query: string | null;
    results: any;
    result_count: number;
    firecrawl_credits: number;
  }>;
  usage: Array<{
    run_id: string;
    stage: CouncilStage;
    model_id: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    latency_ms: number;
    status: "complete" | "error" | "estimated";
    estimated_cost: number;
  }>;
  attachments: StoredAttachment[];
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

const DEFAULT_JUDGE = "z-ai/glm-5.2";
const DEFAULT_COUNCIL = ["minimax/minimax-m3", "stepfun/step-3.7-flash", "xiaomi/mimo-v2.5-pro"];
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
  const router = useRouter();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(DEFAULT_COUNCIL);
  const [judgeModel, setJudgeModel] = useState(DEFAULT_JUDGE);
  const [modelFilter, setModelFilter] = useState("");
  const [prompt, setPrompt] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [researchEnabled, setResearchEnabled] = useState(true);
  const [saveHistory, setSaveHistory] = useState(defaultSaveHistory);
  const [debateDepth, setDebateDepth] = useState(2);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [result, setResult] = useState<CouncilRunResult | null>(null);
  const [attachments, setAttachments] = useState<CouncilAttachment[]>([]);
  const [activeAttachments, setActiveAttachments] = useState<CouncilAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const deferredModelFilter = useDeferredValue(modelFilter);

  // Live run intermediate states
  const [liveInitialResponses, setLiveInitialResponses] = useState<StageResult[]>([]);
  const [liveCritiqueRounds, setLiveCritiqueRounds] = useState<CritiqueResult[][]>([]);
  const [liveRevisions, setLiveRevisions] = useState<StageResult[]>([]);
  const [liveJudge, setLiveJudge] = useState<JudgeResult | null>(null);
  const [liveResearch, setLiveResearch] = useState<ResearchResult | undefined>(undefined);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

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
    setLiveInitialResponses([]);
    setLiveCritiqueRounds([]);
    setLiveRevisions([]);
    setLiveJudge(null);
    setLiveResearch(undefined);
    setSelectedRunId(null);

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

  const isUsingDefaultCouncil = selectedModels.length === DEFAULT_COUNCIL.length
    && selectedModels.every((modelId, index) => modelId === DEFAULT_COUNCIL[index]);

  const liveRunResult = useMemo<CouncilRunResult | null>(() => {
    if (!running && !result) return null;
    if (result) return result;

    const liveTokenTotals = summarizeUsage(usageEvents);
    const liveCostEstimate = usageEvents.reduce((sum, usage) => sum + usage.estimatedCost, 0);

    return {
      id: "live",
      finalAnswer: liveJudge?.synthesis ?? "",
      models: selectedModels,
      judgeModel,
      debateDepth,
      researchEnabled,
      savedMode: saveHistory,
      attachments: activeAttachments,
      research: liveResearch,
      initialResponses: liveInitialResponses,
      critiqueRounds: liveCritiqueRounds,
      revisions: liveRevisions,
      judge: liveJudge ?? {
        id: "live-judge",
        modelId: judgeModel,
        synthesis: "",
        rankings: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0,
        status: "complete"
      },
      usageEvents,
      tokenTotals: liveTokenTotals,
      costEstimate: liveCostEstimate,
      latencyMs: 0,
      createdAt: new Date().toISOString()
    };
  }, [
    running, result, selectedModels, judgeModel, debateDepth, researchEnabled,
    saveHistory, activeAttachments, liveResearch, liveInitialResponses,
    liveCritiqueRounds, liveRevisions, liveJudge, usageEvents
  ]);

  const activeRunDetails = useMemo<CouncilRunResult | null>(() => {
    if (running || (!result && statusLog.length > 0)) {
      return liveRunResult;
    }
    if (selectedRunId) {
      if (result && result.id === selectedRunId) {
        return result;
      }
      if (thread) {
        const foundRun = thread.runs.find((r) => r.id === selectedRunId);
        if (foundRun) {
          return reconstructRunResult(foundRun, thread);
        }
      }
    }
    if (result) {
      return result;
    }
    if (thread && thread.runs.length > 0) {
      const latestRun = thread.runs[thread.runs.length - 1];
      return reconstructRunResult(latestRun, thread);
    }
    return null;
  }, [running, result, statusLog.length, liveRunResult, selectedRunId, thread]);

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
    setSelectedModels((current) => {
      const isDefault = current.length === DEFAULT_COUNCIL.length && current.every((modelId, index) => modelId === DEFAULT_COUNCIL[index]);
      if (current.length && !isDefault) return current;
      const validDefaults = DEFAULT_COUNCIL.filter((id) => body.models.some((m) => m.id === id));
      return validDefaults.length ? validDefaults : body.models.slice(0, 3).map((m) => m.id);
    });
    setJudgeModel((current) => {
      if (current && current !== DEFAULT_JUDGE) return current;
      return body.models.some((m) => m.id === DEFAULT_JUDGE) ? DEFAULT_JUDGE : body.models[0]?.id || "";
    });
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

  async function deleteChat(chatId: string) {
    const previousChats = chats;
    const chat = previousChats.find((item) => item.id === chatId);
    if (!chat || deletingChatId) return;

    const confirmed = window.confirm(`Delete "${chat.title}"? This removes the saved conversation.`);
    if (!confirmed) return;

    setDeletingChatId(chatId);
    setError("");
    setChats((current) => current.filter((item) => item.id !== chatId));

    try {
      const response = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readResponseError(response));
      }

      if (initialThreadId === chatId) {
        setThread(null);
        setResult(null);
        setActivePrompt("");
        setStatusLog([]);
        setUsageEvents([]);
        setSelectedRunId(null);
        router.push("/app");
      } else {
        router.refresh();
      }
    } catch (deleteError) {
      setChats(previousChats);
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete chat.");
    } finally {
      setDeletingChatId(null);
    }
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
    if (running || uploading || !trimmedPrompt || selectedModels.length === 0 || !judgeModel) return;
    const queuedAttachments = attachments;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setRunning(true);
    setStopping(false);
    setError("");
    setResult(null);
    setActivePrompt(trimmedPrompt);
    setActiveAttachments(queuedAttachments);
    setUploadError("");
    setPrompt("");
    setLiveInitialResponses([]);
    setLiveCritiqueRounds([]);
    setLiveRevisions([]);
    setLiveJudge(null);
    setLiveResearch(undefined);
    setSelectedRunId(null);
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
        }),
        signal: controller.signal
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
      if (isAbortError(runError)) {
        setError("");
        setStatusLog((current) => current.at(-1) === "Council run stopped." ? current : [...current, "Council run stopped."]);
      } else {
        setError(runError instanceof Error ? runError.message : "Council request failed.");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setRunning(false);
      setStopping(false);
    }
  }

  function stopRun() {
    if (!running || stopping) return;
    setStopping(true);
    setStatusLog((current) => current.at(-1) === "Stopping council run." ? current : [...current, "Stopping council run."]);
    abortControllerRef.current?.abort();
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
      setLiveResearch(event.research);
      setStatusLog((current) => [...current, `Found ${event.research.sources.length} detailed Firecrawl sources.`]);
    }
    if (event.type === "usage") {
      setUsageEvents((current) => [...current, event.usage]);
    }
    if (event.type === "model_response") {
      if (event.response.stage === "initial_answer") {
        setLiveInitialResponses((current) => {
          const existingIdx = current.findIndex((r) => r.modelId === event.response.modelId);
          if (existingIdx > -1) {
            const copy = [...current];
            copy[existingIdx] = event.response;
            return copy;
          }
          return [...current, event.response];
        });
      } else if (event.response.stage === "revision") {
        setLiveRevisions((current) => {
          const existingIdx = current.findIndex((r) => r.modelId === event.response.modelId);
          if (existingIdx > -1) {
            const copy = [...current];
            copy[existingIdx] = event.response;
            return copy;
          }
          return [...current, event.response];
        });
      }
    }
    if (event.type === "critique") {
      setLiveCritiqueRounds((current) => {
        const copy = [...current];
        const roundIdx = event.critique.roundIndex - 1;
        if (!copy[roundIdx]) {
          copy[roundIdx] = [];
        }
        const existingIdx = copy[roundIdx].findIndex((c) => c.modelId === event.critique.modelId);
        if (existingIdx > -1) {
          copy[roundIdx][existingIdx] = event.critique;
        } else {
          copy[roundIdx].push(event.critique);
        }
        return copy;
      });
    }
    if (event.type === "judge") {
      setLiveJudge(event.judge);
    }
    if (event.type === "complete") {
      setResult(event.result);
      setSelectedRunId(event.result.id);
      setStatusLog((current) => [...current, "Council run complete."]);
    }
    if (event.type === "error") {
      setError(event.message);
    }
    window.requestAnimationFrame(() => activityEndRef.current?.scrollIntoView({ behavior: "smooth" }));
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
          {chats.map((chat) => {
            const isActive = initialThreadId === chat.id;
            const isDeleting = deletingChatId === chat.id;

            return (
              <div className={`chat-row ${isActive ? "active" : ""}`} key={chat.id}>
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className="chat-link"
                  href={`/app/chats/${chat.id}`}
                  prefetch={false}
                >
                  <strong>{chat.title}</strong>
                  <span>{formatDate(chat.updated_at)}</span>
                </Link>
                <button
                  aria-label={`Delete ${chat.title}`}
                  className="icon-button ghost chat-delete-button"
                  disabled={isDeleting || running}
                  title={isDeleting ? "Deleting chat" : `Delete ${chat.title}`}
                  type="button"
                  onClick={() => void deleteChat(chat.id)}
                >
                  {isDeleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                </button>
              </div>
            );
          })}
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
                {isUsingDefaultCouncil ? <span className="pill">Default council</span> : null}
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
          {thread ? (
            <StoredThreadView
              thread={thread}
              onShowDetails={(runId) => {
                setSelectedRunId(runId);
              }}
            />
          ) : null}
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
          {result ? (
            <ActiveResult
              result={result}
              onShowDetails={() => {
                setSelectedRunId(result.id);
              }}
            />
          ) : null}
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
              {running ? (
                <button className="send-button stop-button" disabled={stopping} type="button" title={stopping ? "Stopping" : "Stop"} onClick={stopRun}>
                  {stopping ? <Loader2 className="spin" size={17} /> : <Square size={16} />}
                </button>
              ) : (
                <button className="send-button" disabled={!canSubmit} type="submit" title="Send">
                  <Send size={17} />
                </button>
              )}
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

      <aside className="activity-pane" aria-label="Council activity">
        <div className="activity-header">
          <div>
            <h2>Run Details &amp; Trace</h2>
            <p className="muted">
              {running ? "Running..." : activeRunDetails ? "Complete" : "Waiting"}
            </p>
          </div>
        </div>
        <div className="activity-scroll">
          {activeRunDetails ? (
            <div className="activity-section">
              <h3 className="activity-section-title">Configuration</h3>
              <div className="pill-row" style={{ marginTop: "4px" }}>
                <span className="pill">Judge: {modelLabel(models, activeRunDetails.judgeModel)}</span>
                <span className="pill">Debate: {activeRunDetails.debateDepth} {activeRunDetails.debateDepth === 1 ? "round" : "rounds"}</span>
                {activeRunDetails.researchEnabled ? <span className="pill">Research</span> : null}
              </div>
              <div className="pill-row" style={{ marginTop: "4px" }}>
                <span className="pill">Models:</span>
                {activeRunDetails.models.map((m) => (
                  <span className="pill" key={m}>{modelLabel(models, m)}</span>
                ))}
              </div>
              {activeRunDetails.latencyMs > 0 ? (
                <div className="pill-row" style={{ marginTop: "4px" }}>
                  <span className="pill">Latency: {formatDuration(activeRunDetails.latencyMs)}</span>
                  <span className="pill">Cost: ${activeRunDetails.costEstimate.toFixed(6)}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {statusLog.length > 0 && running ? (
            <div className="activity-section">
              <h3 className="activity-section-title">Progress</h3>
              <div className="status-log">
                {statusLog.map((message, index) => (
                  <span key={`${message}-${index}`}>{message}</span>
                ))}
              </div>
            </div>
          ) : null}

          {activeRunDetails && activeRunDetails.usageEvents.length > 0 ? (
            <div className="activity-section">
              <TokenBreakdown
                totals={activeRunDetails.tokenTotals}
                events={activeRunDetails.usageEvents}
                costEstimate={activeRunDetails.costEstimate}
              />
            </div>
          ) : null}

          {activeRunDetails ? (
            <div className="activity-section">
              <h3 className="activity-section-title">Debate trace</h3>
              <RunTrace result={activeRunDetails} />
            </div>
          ) : (
            <p className="muted small text-center" style={{ padding: "40px 0" }}>
              No active run or details selected. Start a run or click &quot;Run details&quot; in chat to view progress.
            </p>
          )}
          <div ref={activityEndRef} />
        </div>
      </aside>

      {settingsOpen ? <button className="drawer-scrim" type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)} /> : null}
    </main>
  );
}

function ActiveResult({ result, onShowDetails }: { result: CouncilRunResult; onShowDetails: () => void }) {
  return (
    <Message role="assistant">
      <div className="answer-header">
        <div className="assistant-name">
          <Bot size={16} />
          AI Council
        </div>
        <div className="pill-row">
          <span className="pill">{result.savedMode ? "Saved" : "Ephemeral"}</span>
          <span className="pill">{formatDuration(result.latencyMs)}</span>
          <span className="pill">{result.models.length} models</span>
        </div>
      </div>
      <FormattedAnswer finalAnswer={result.finalAnswer} />
      <button
        className="button subtle small"
        style={{ marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
        type="button"
        onClick={onShowDetails}
      >
        <SlidersHorizontal size={14} />
        Run details
      </button>
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
            <FormattedAnswer finalAnswer={run.final_answer ?? ""} />
            <button
              className="button subtle small"
              style={{ marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              type="button"
              onClick={() => onShowDetails(run.id)}
            >
              <SlidersHorizontal size={14} />
              Run details
            </button>
          </Message>
        </div>
      ))}
    </div>
  );
}

function FormattedAnswer({ finalAnswer }: { finalAnswer: string }) {
  const { mainAnswer, consensus, disagreements, blindSpots } = useMemo(() => parseCouncilAnswer(finalAnswer), [finalAnswer]);

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
                {disagreements.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {blindSpots.length ? (
            <div className="council-meta-section">
              <h3>Blind spots</h3>
              <ul>
                {blindSpots.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function reconstructRunResult(run: StoredRun, thread: ThreadPayload): CouncilRunResult {
  const responses = (thread.responses ?? [])
    .filter((r) => r.run_id === run.id)
    .map((r) => ({
      id: r.id,
      modelId: r.model_id,
      stage: r.stage,
      content: r.content ?? "",
      usage: r.token_usage,
      latencyMs: r.latency_ms,
      status: r.status,
      error: r.error ?? undefined
    }));

  const initialResponses = responses.filter((r) => r.stage === "initial_answer");
  const revisions = responses.filter((r) => r.stage === "revision");

  const runCritiques = (thread.critiques ?? [])
    .filter((c) => c.run_id === run.id)
    .map((c) => ({
      id: c.id,
      roundIndex: c.round_index,
      modelId: c.model_id,
      content: c.content ?? "",
      usage: c.token_usage,
      latencyMs: c.latency_ms,
      status: c.status,
      error: c.error ?? undefined
    }));

  const critiqueRounds: CritiqueResult[][] = [];
  for (const c of runCritiques) {
    const roundIdx = c.roundIndex - 1;
    if (!critiqueRounds[roundIdx]) {
      critiqueRounds[roundIdx] = [];
    }
    critiqueRounds[roundIdx].push(c);
  }

  const judgeDb = (thread.judges ?? []).find((j) => j.run_id === run.id);
  const judge: JudgeResult = judgeDb
    ? {
        id: judgeDb.id,
        modelId: judgeDb.judge_model,
        synthesis: judgeDb.synthesis ?? "",
        rankings: judgeDb.rankings ?? [],
        usage: judgeDb.token_usage,
        latencyMs: judgeDb.latency_ms,
        status: judgeDb.status,
        error: judgeDb.error ?? undefined
      }
    : {
        id: "unknown",
        modelId: run.judge_model,
        synthesis: run.final_answer ?? "",
        rankings: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0,
        status: "complete"
      };

  const researchDb = (thread.research ?? []).find((r) => r.run_id === run.id);
  const research: ResearchResult | undefined = researchDb
    ? {
        query: researchDb.query ?? "",
        sources: researchDb.results ?? [],
        credits: Number(researchDb.firecrawl_credits || 0),
        estimatedContextTokens: researchDb.result_count * 300
      }
    : undefined;

  const usageEvents: UsageEvent[] = (thread.usage ?? [])
    .filter((u) => u.run_id === run.id)
    .map((u) => ({
      stage: u.stage,
      modelId: u.model_id,
      promptTokens: u.prompt_tokens,
      completionTokens: u.completion_tokens,
      totalTokens: u.total_tokens,
      latencyMs: u.latency_ms,
      status: u.status,
      estimatedCost: Number(u.estimated_cost || 0)
    }));

  const costEstimate = usageEvents.reduce((sum, u) => sum + u.estimatedCost, 0);

  return {
    id: run.id,
    threadId: thread.thread.id,
    prompt: run.prompt_text ?? undefined,
    finalAnswer: run.final_answer ?? "",
    models: run.models,
    judgeModel: run.judge_model,
    debateDepth: run.debate_depth,
    researchEnabled: run.research_enabled,
    savedMode: true,
    attachments: (run.attachments ?? []).map(normalizeStoredAttachment),
    research,
    initialResponses,
    critiqueRounds,
    revisions,
    judge,
    usageEvents,
    tokenTotals: run.token_totals,
    costEstimate,
    latencyMs: run.latency_ms,
    createdAt: run.created_at
  };
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

function isAbortError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "APIUserAbortError";
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

function parseCouncilAnswer(text: string): {
  mainAnswer: string;
  consensus: string;
  disagreements: string[];
  blindSpots: string[];
} {
  let jsonText = text.trim();
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7).trim();
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3).trim();
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object") {
      const parsedRecord = parsed as Record<string, unknown>;
      const mainAnswer = String(parsedRecord.final_answer ?? parsedRecord.finalAnswer ?? "");
      const consensus = String(parsedRecord.consensus ?? "");
      const disagreements = normalizeStringArray(parsedRecord.disagreements);
      const blindSpots = normalizeStringArray(parsedRecord.blind_spots ?? parsedRecord.blindSpots);
      return {
        mainAnswer: mainAnswer.trim(),
        consensus: consensus.trim(),
        disagreements,
        blindSpots
      };
    }
  } catch (e) {
    // Not JSON
  }

  const looseAnswer = extractLooseJsonStringField(jsonText, "final_answer") ?? extractLooseJsonStringField(jsonText, "finalAnswer");
  if (looseAnswer) {
    return {
      mainAnswer: looseAnswer.trim(),
      consensus: (extractLooseJsonStringField(jsonText, "consensus") ?? "").trim(),
      disagreements: extractLooseJsonArrayField(jsonText, "disagreements"),
      blindSpots: [
        ...extractLooseJsonArrayField(jsonText, "blind_spots"),
        ...extractLooseJsonArrayField(jsonText, "blindSpots")
      ]
    };
  }

  const sections = text.split(/\n\n(?=Consensus\n|Disagreements\n|Blind spots\n)/i);
  const mainAnswer = sections[0] ?? text;
  let consensus = "";
  const disagreements: string[] = [];
  const blindSpots: string[] = [];

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    if (/^Consensus\n/i.test(section)) {
      consensus = section.replace(/^Consensus\n/i, "").trim();
    } else if (/^Disagreements\n/i.test(section)) {
      const lines = section.replace(/^Disagreements\n/i, "").trim().split("\n");
      for (const line of lines) {
        const cleaned = line.replace(/^-\s*/, "").trim();
        if (cleaned) disagreements.push(cleaned);
      }
    } else if (/^Blind spots\n/i.test(section)) {
      const lines = section.replace(/^Blind spots\n/i, "").trim().split("\n");
      for (const line of lines) {
        const cleaned = line.replace(/^-\s*/, "").trim();
        if (cleaned) blindSpots.push(cleaned);
      }
    }
  }

  return { mainAnswer: mainAnswer.trim(), consensus, disagreements, blindSpots };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function extractLooseJsonStringField(text: string, field: string): string | undefined {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(text);
  if (!match) return undefined;
  return decodeJsonStringFragment(match[1]);
}

function extractLooseJsonArrayField(text: string, field: string): string[] {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedField}"\\s*:\\s*\\[([\\s\\S]*?)]`).exec(text);
  if (!match) return [];

  const values: string[] = [];
  const itemPattern = /"((?:\\.|[^"\\])*)"/g;
  let item: RegExpExecArray | null;
  while ((item = itemPattern.exec(match[1])) !== null) {
    const decoded = decodeJsonStringFragment(item[1]).trim();
    if (decoded) values.push(decoded);
  }
  return values;
}

function decodeJsonStringFragment(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
