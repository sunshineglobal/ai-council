"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeft, Settings2 } from "lucide-react";
import { ActivityPanel } from "@/components/council-workspace/activity-panel";
import { ChatSidebar } from "@/components/council-workspace/chat-sidebar";
import { Composer } from "@/components/council-workspace/composer";
import { Conversation } from "@/components/council-workspace/conversation";
import { buildLiveRunResult } from "@/components/council-workspace/live-run-state";
import { isDefaultCouncil } from "@/components/council-workspace/model-selection";
import {
  compactTitle,
  modelLabel,
  reconstructRunResult
} from "@/components/council-workspace/result-utils";
import { SettingsDialog } from "@/components/council-workspace/settings-dialog";
import { useAttachments } from "@/components/council-workspace/use-attachments";
import { useCouncilRun } from "@/components/council-workspace/use-council-run";
import { useWorkspaceData } from "@/components/council-workspace/use-workspace-data";
import { MAX_ATTACHMENT_COUNT } from "@/lib/limits";
import type { CouncilRunResult } from "@/lib/types";

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
  const {
    run,
    running,
    stopping,
    prompt,
    setPrompt,
    promptRef,
    activityEndRef,
    selectedRunId,
    setSelectedRunId,
    submit,
    stop,
    reportError,
    clearError
  } = useCouncilRun({ initialThreadId });
  const {
    attachments,
    uploading,
    uploadError,
    uploadFiles,
    removeAttachment,
    clearAttachments,
    clearUploadError
  } = useAttachments();
  const {
    models,
    selectedModels,
    judgeModel,
    setJudgeModel,
    chats,
    deletingChatId,
    thread,
    threadLoading,
    loadChats,
    loadThread,
    deleteChat,
    toggleModel
  } = useWorkspaceData({
    initialThreadId,
    running,
    onError: reportError,
    onClearError: clearError
  });
  const [modelFilter, setModelFilter] = useState("");
  const [researchEnabled, setResearchEnabled] = useState(true);
  const [saveHistory, setSaveHistory] = useState(defaultSaveHistory);
  const [debateDepth, setDebateDepth] = useState(2);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deferredModelFilter = useDeferredValue(modelFilter);

  useEffect(() => {
    clearUploadError();
    setSettingsOpen(false);
  }, [clearUploadError, initialThreadId]);

  const filteredModels = useMemo(() => {
    const query = deferredModelFilter.trim().toLowerCase();
    if (!query) return models.slice(0, 80);
    return models
      .filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(query))
      .slice(0, 80);
  }, [deferredModelFilter, models]);

  const liveRunResult = useMemo(() => buildLiveRunResult(run), [run]);
  const activeRunDetails = useMemo<CouncilRunResult | null>(() => {
    if (running) return liveRunResult;
    if (selectedRunId) {
      if (run.result?.id === selectedRunId) return run.result;
      const storedRun = thread?.runs.find((item) => item.id === selectedRunId);
      if (storedRun && thread) return reconstructRunResult(storedRun, thread);
    }
    if (run.result) return run.result;
    const latestRun = thread?.runs.at(-1);
    return latestRun && thread ? reconstructRunResult(latestRun, thread) : null;
  }, [liveRunResult, run.result, running, selectedRunId, thread]);

  const activeTitle = thread?.thread.title
    || compactTitle(run.prompt || run.result?.prompt || prompt)
    || "AI Council";
  const canSubmit = Boolean(prompt.trim() && selectedModels.length > 0 && judgeModel && !running && !uploading);
  const canAttachMore = attachments.length < MAX_ATTACHMENT_COUNT && !running && !uploading;
  const selectedModelLabels = useMemo(
    () => selectedModels.map((modelId) => ({ id: modelId, label: modelLabel(models, modelId) })),
    [models, selectedModels]
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit({
      config: {
        models: selectedModels,
        judgeModel,
        debateDepth,
        researchEnabled,
        saveHistory,
        threadId: saveHistory ? initialThreadId : undefined
      },
      attachments,
      uploading,
      clearAttachments,
      clearAttachmentError: clearUploadError,
      loadChats,
      loadThread
    });
  }

  return (
    <main className={`workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <ChatSidebar
        chats={chats}
        currentThreadId={initialThreadId}
        deletingChatId={deletingChatId}
        running={running}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onDelete={(chatId) => void deleteChat(chatId)}
      />

      <section className="main-pane chat-pane">
        <header className="chat-header">
          <div className="chat-title-group">
            {!sidebarOpen ? (
              <button
                aria-controls="chat-history-sidebar"
                aria-expanded={sidebarOpen}
                aria-label="Show chat history"
                className="icon-button ghost"
                type="button"
                title="Show sidebar"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeft aria-hidden size={18} />
              </button>
            ) : null}
            <div>
              <h1>{activeTitle}</h1>
              <div className="pill-row">
                <span className="pill">{selectedModels.length} models</span>
                <span className="pill">{debateDepth} rounds</span>
                {isDefaultCouncil(selectedModels) ? <span className="pill">Default council</span> : null}
                {researchEnabled ? <span className="pill">Research</span> : null}
              </div>
            </div>
          </div>
          <button
            aria-controls="council-settings-dialog"
            aria-expanded={settingsOpen}
            className="button subtle"
            type="button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 aria-hidden size={16} />
            Settings
          </button>
        </header>

        <Conversation
          thread={thread}
          threadLoading={threadLoading}
          run={run}
          running={running}
          onPickPrompt={(suggestion) => {
            setPrompt(suggestion);
            window.requestAnimationFrame(() => promptRef.current?.focus());
          }}
          onShowDetails={setSelectedRunId}
        />

        <Composer
          prompt={prompt}
          promptRef={promptRef}
          fileInputRef={fileInputRef}
          attachments={attachments}
          uploadError={uploadError}
          uploading={uploading}
          canAttachMore={canAttachMore}
          running={running}
          stopping={stopping}
          canSubmit={canSubmit}
          judgeLabel={judgeModel ? modelLabel(models, judgeModel) : "Choose a judge"}
          saveHistory={saveHistory}
          fileAccept={FILE_ACCEPT}
          onPromptChange={setPrompt}
          onUploadFiles={(inputEvent) => void uploadFiles(inputEvent, saveHistory)}
          onRemoveAttachment={(fileId) => void removeAttachment(fileId)}
          onStop={stop}
          onSubmit={handleSubmit}
        />
      </section>

      {settingsOpen ? (
        <SettingsDialog
          models={models}
          filteredModels={filteredModels}
          selectedModels={selectedModels}
          selectedModelLabels={selectedModelLabels}
          judgeModel={judgeModel}
          debateDepth={debateDepth}
          researchEnabled={researchEnabled}
          saveHistory={saveHistory}
          modelFilter={modelFilter}
          running={running}
          onJudgeModelChange={setJudgeModel}
          onDebateDepthChange={setDebateDepth}
          onResearchEnabledChange={setResearchEnabled}
          onSaveHistoryChange={setSaveHistory}
          onModelFilterChange={setModelFilter}
          onToggleModel={toggleModel}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      <ActivityPanel
        result={activeRunDetails}
        models={models}
        running={running}
        statusLog={run.statusLog}
        activityEndRef={activityEndRef}
      />
    </main>
  );
}
