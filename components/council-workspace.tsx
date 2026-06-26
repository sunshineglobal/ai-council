"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { History, Play, Search, SlidersHorizontal } from "lucide-react";
import { MarkdownBlock } from "@/components/markdown-block";
import { RunTrace } from "@/components/run-trace";
import { TokenBreakdown } from "@/components/token-breakdown";
import type { CouncilEvent, CouncilRunResult, ModelOption, TokenTotals, UsageEvent } from "@/lib/types";

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
};

type ThreadPayload = {
  thread: { id: string; title: string };
  runs: StoredRun[];
};

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
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [saveHistory, setSaveHistory] = useState(defaultSaveHistory);
  const [debateDepth, setDebateDepth] = useState(2);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [result, setResult] = useState<CouncilRunResult | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [thread, setThread] = useState<ThreadPayload | null>(null);

  useEffect(() => {
    void loadModels();
    void loadChats();
  }, []);

  useEffect(() => {
    if (initialThreadId) {
      void loadThread(initialThreadId);
    }
  }, [initialThreadId]);

  const filteredModels = useMemo(() => {
    const query = modelFilter.trim().toLowerCase();
    if (!query) return models.slice(0, 80);
    return models.filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(query)).slice(0, 80);
  }, [modelFilter, models]);

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || selectedModels.length === 0 || !judgeModel) return;

    setRunning(true);
    setError("");
    setResult(null);
    setUsageEvents([]);
    setStatusLog(["Starting council run."]);

    try {
      const response = await fetch("/api/council/runs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          models: selectedModels,
          judgeModel,
          debateDepth,
          researchEnabled,
          saveHistory,
          threadId: saveHistory ? initialThreadId : undefined
        })
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Council request failed.");
      }

      await readEventStream(response.body);
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

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const dataLine = block
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6);
        if (!dataLine) continue;
        const event = JSON.parse(dataLine) as CouncilEvent;
        handleCouncilEvent(event);
      }
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
    <main className="workspace">
      <aside className="sidebar">
        <div className="section-title">
          <h2>Chats</h2>
          <History size={16} />
        </div>
        <div className="chat-list">
          {chats.length === 0 ? <p className="muted">Saved chats will appear here.</p> : null}
          {chats.map((chat) => (
            <Link className="chat-link" href={`/app/chats/${chat.id}`} key={chat.id}>
              <strong>{chat.title}</strong>
              <span>{new Date(chat.updated_at).toLocaleString()}</span>
            </Link>
          ))}
        </div>
      </aside>

      <section className="main-pane">
        <form className="composer" onSubmit={submit}>
          <div className="section-title">
            <div>
              <h2>New council prompt</h2>
              <p className="muted">Models answer, debate, revise, and hand the result to a judge.</p>
            </div>
            <button className="button primary" disabled={running || !prompt.trim() || selectedModels.length === 0} type="submit">
              <Play size={16} />
              {running ? "Running" : "Run council"}
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask the council..."
          />
          <div className="control-grid">
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
            <label className="field">
              <span>Debate depth</span>
              <select value={debateDepth} onChange={(event) => setDebateDepth(Number(event.target.value))}>
                <option value={1}>1 round</option>
                <option value={2}>2 rounds</option>
                <option value={3}>3 rounds</option>
                <option value={4}>4 rounds</option>
              </select>
            </label>
            <div className="field">
              <span>Run mode</span>
              <label className="toggle-row">
                <input
                  checked={researchEnabled}
                  type="checkbox"
                  onChange={(event) => setResearchEnabled(event.target.checked)}
                />
                Firecrawl research
              </label>
              <label className="toggle-row">
                <input checked={saveHistory} type="checkbox" onChange={(event) => setSaveHistory(event.target.checked)} />
                Save history
              </label>
            </div>
          </div>
        </form>

        <div className="run-area">
          {error ? <div className="panel error-text">{error}</div> : null}
          {statusLog.length ? (
            <section className="panel">
              <h2>Run status</h2>
              <div className="status-log">
                {statusLog.map((message, index) => (
                  <span key={`${message}-${index}`}>{message}</span>
                ))}
              </div>
            </section>
          ) : null}
          {usageEvents.length > 0 && !result ? <TokenBreakdown events={usageEvents} /> : null}
          {result ? (
            <>
              <section className="panel">
                <div className="section-title">
                  <h2>Final answer</h2>
                  <div className="pill-row">
                    <span className="pill">{result.savedMode ? "saved" : "ephemeral"}</span>
                    <span className="pill">{result.latencyMs}ms</span>
                  </div>
                </div>
                <MarkdownBlock text={result.finalAnswer} />
              </section>
              <TokenBreakdown totals={result.tokenTotals} events={result.usageEvents} costEstimate={result.costEstimate} />
              <RunTrace result={result} />
            </>
          ) : null}
          {thread ? <StoredThreadView thread={thread} /> : null}
        </div>
      </section>

      <aside className="settings-pane">
        <div className="section-title">
          <h2>Council models</h2>
          <SlidersHorizontal size={16} />
        </div>
        <label className="field">
          <span>Search models</span>
          <span style={{ position: "relative" }}>
            <Search aria-hidden size={16} style={{ left: 10, position: "absolute", top: 11 }} />
            <input
              value={modelFilter}
              onChange={(event) => setModelFilter(event.target.value)}
              placeholder="openai, claude, llama..."
              style={{ paddingLeft: 34 }}
            />
          </span>
        </label>
        <p className="muted">{selectedModels.length}/8 selected</p>
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
      </aside>
    </main>
  );
}

function StoredThreadView({ thread }: { thread: ThreadPayload }) {
  return (
    <section className="panel">
      <h2>{thread.thread.title}</h2>
      <div className="stack">
        {thread.runs.map((run) => (
          <details className="trace" key={run.id}>
            <summary>
              <span>{run.prompt_text || "Ephemeral prompt"}</span>
              <span className="pill">{new Date(run.created_at).toLocaleString()}</span>
            </summary>
            <div className="trace-body stack">
              <MarkdownBlock text={run.final_answer ?? undefined} empty="No saved final answer." />
              <TokenBreakdown totals={run.token_totals} />
              <div className="pill-row">
                <span className="pill">{run.models.length} models</span>
                <span className="pill">judge {run.judge_model}</span>
                <span className="pill">{run.debate_depth} debate rounds</span>
                {run.research_enabled ? <span className="pill">Firecrawl research</span> : null}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
