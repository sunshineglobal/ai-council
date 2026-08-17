"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeft, PanelRight, Settings2 } from "lucide-react";
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
import { useMonthlyUsage } from "@/components/council-workspace/use-monthly-usage";
import { useResponsiveSidebar } from "@/components/council-workspace/use-responsive-sidebar";
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

const ACTIVITY_MEDIA = "(max-width: 980px)";

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
  const budgetChip = useMonthlyUsage(run.result?.id ?? null);
  const {
    attachments,
    uploading,
    uploadError,
    uploadFiles,
    uploadFileList,
    removeAttachment,
    clearAttachments,
    clearUploadError
  } = useAttachments();
  const [modelFilter, setModelFilter] = useState("");
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [saveHistory, setSaveHistory] = useState(defaultSaveHistory);
  const [savingPreference, setSavingPreference] = useState(false);
  const [debateDepth, setDebateDepth] = useState(2);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [activityNarrow, setActivityNarrow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const skipTitleBlurRef = useRef(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const deferredModelFilter = useDeferredValue(modelFilter);
  const sidebar = useResponsiveSidebar();
  const {
    models,
    researchAvailable,
    selectedModels,
    judgeModel,
    setJudgeModel,
    chats,
    chatsCursor,
    loadingMoreChats,
    deletingChatId,
    renamingChatId,
    thread,
    olderRunsCursor,
    loadingOlderRuns,
    threadLoading,
    loadChats,
    loadMoreChats,
    loadThread,
    loadOlderRuns,
    deleteChat,
    renameChat,
    toggleModel
  } = useWorkspaceData({
    initialThreadId,
    running,
    debateDepth,
    researchEnabled,
    onDebateDepthChange: setDebateDepth,
    onResearchEnabledChange: setResearchEnabled,
    onError: reportError,
    onClearError: clearError
  });

  useEffect(() => {
    clearUploadError();
    setSettingsOpen(false);
    setEditingTitle(false);
  }, [clearUploadError, initialThreadId]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(ACTIVITY_MEDIA);
    let wasNarrow = media.matches;
    setActivityNarrow(wasNarrow);
    setActivityOpen(!wasNarrow);
    const sync = () => {
      const narrow = media.matches;
      setActivityNarrow(narrow);
      if (narrow && !wasNarrow) setActivityOpen(false);
      if (!narrow && wasNarrow) setActivityOpen(true);
      wasNarrow = narrow;
    };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (running) setActivityOpen(true);
  }, [running]);

  useEffect(() => {
    if (!selectedRunId) return;
    setActivityOpen(true);
  }, [selectedRunId]);

  async function handleSaveHistoryChange(enabled: boolean) {
    const previous = saveHistory;
    setSaveHistory(enabled);
    setSavingPreference(true);
    clearError();
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultSaveHistory: enabled })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Could not save preference.");
      }
    } catch (error) {
      setSaveHistory(previous);
      reportError(error instanceof Error ? error.message : "Could not save preference.");
    } finally {
      setSavingPreference(false);
    }
  }

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
  const canRenameTitle = Boolean(initialThreadId && thread?.thread.id === initialThreadId);
  const selectedModelLabels = useMemo(
    () => selectedModels.map((modelId) => ({ id: modelId, label: modelLabel(models, modelId) })),
    [models, selectedModels]
  );

  function beginTitleEdit() {
    if (!canRenameTitle || running) return;
    skipTitleBlurRef.current = false;
    setTitleDraft(thread?.thread.title || activeTitle);
    setEditingTitle(true);
    window.requestAnimationFrame(() => titleInputRef.current?.focus());
  }

  async function commitTitleEdit() {
    if (!initialThreadId || !editingTitle) return;
    const next = titleDraft.trim();
    if (!next || next === thread?.thread.title) {
      setEditingTitle(false);
      return;
    }
    const ok = await renameChat(initialThreadId, next);
    if (ok) setEditingTitle(false);
  }

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

  function handleShowDetails(runId: string) {
    setSelectedRunId(runId);
    setActivityOpen(true);
  }

  return (
    <main
      className={[
        "workspace",
        sidebar.open ? "" : "sidebar-collapsed",
        sidebar.overlayOpen ? "sidebar-overlay-open" : "",
        activityOpen ? "" : "activity-collapsed"
      ].filter(Boolean).join(" ")}
    >
      <ChatSidebar
        chats={chats}
        currentThreadId={initialThreadId}
        deletingChatId={deletingChatId}
        renamingChatId={renamingChatId}
        running={running}
        open={sidebar.open}
        modal={sidebar.overlayOpen}
        sidebarRef={sidebar.sidebarRef}
        initialFocusRef={sidebar.initialFocusRef}
        onClose={sidebar.closeSidebar}
        onDelete={(chatId) => void deleteChat(chatId)}
        onRename={renameChat}
        hasMoreChats={Boolean(chatsCursor)}
        loadingMoreChats={loadingMoreChats}
        onLoadMoreChats={() => void loadMoreChats()}
      />

      {sidebar.overlayOpen ? (
        <button
          aria-label="Close chat history"
          className="sidebar-scrim"
          type="button"
          onClick={sidebar.closeSidebar}
        />
      ) : null}

      <section className="main-pane chat-pane">
        <header className="chat-header">
          <div className="chat-title-group">
            <button
              ref={sidebar.triggerRef}
              aria-controls="chat-history-sidebar"
              aria-expanded={sidebar.open}
              aria-label="Show chat history"
              className="icon-button ghost sidebar-open-button"
              type="button"
              title="Show sidebar"
              onClick={sidebar.openSidebar}
            >
              <PanelLeft aria-hidden size={18} />
            </button>
            <div>
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  aria-label="Chat title"
                  className="chat-title-input"
                  maxLength={120}
                  value={titleDraft}
                  onBlur={() => {
                    if (skipTitleBlurRef.current) {
                      skipTitleBlurRef.current = false;
                      return;
                    }
                    void commitTitleEdit();
                  }}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void commitTitleEdit();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      skipTitleBlurRef.current = true;
                      setEditingTitle(false);
                    }
                  }}
                />
              ) : (
                <h1>
                  {canRenameTitle ? (
                    <button
                      className="chat-title-button"
                      type="button"
                      title="Rename chat"
                      onClick={beginTitleEdit}
                    >
                      {activeTitle}
                    </button>
                  ) : activeTitle}
                </h1>
              )}
              <div className="pill-row">
                <span className="pill">{selectedModels.length} models</span>
                <span className="pill">{debateDepth} rounds</span>
                {isDefaultCouncil(selectedModels) ? <span className="pill">Default council</span> : null}
                {researchEnabled ? <span className="pill">Research</span> : null}
              </div>
            </div>
          </div>
          <div className="chat-header-actions">
            {!activityOpen ? (
              <button
                aria-controls="council-activity-panel"
                aria-expanded={false}
                aria-label="Show run details"
                className="button subtle"
                type="button"
                onClick={() => setActivityOpen(true)}
              >
                <PanelRight aria-hidden size={16} />
                Details
              </button>
            ) : null}
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
          </div>
        </header>

        <Conversation
          thread={thread}
          threadLoading={threadLoading}
          run={run}
          running={running}
          hasOlderRuns={Boolean(olderRunsCursor)}
          loadingOlderRuns={loadingOlderRuns}
          onLoadOlderRuns={() => void loadOlderRuns()}
          onPickPrompt={(suggestion) => {
            setPrompt(suggestion);
            window.requestAnimationFrame(() => promptRef.current?.focus());
          }}
          onShowDetails={handleShowDetails}
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
          onUploadFileList={(files) => void uploadFileList(files, saveHistory)}
          onRemoveAttachment={(fileId) => void removeAttachment(fileId)}
          onStop={stop}
          onSubmit={handleSubmit}
          budgetChip={budgetChip}
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
          researchAvailable={researchAvailable}
          saveHistory={saveHistory}
          modelFilter={modelFilter}
          running={running}
          onJudgeModelChange={setJudgeModel}
          onDebateDepthChange={setDebateDepth}
          onResearchEnabledChange={setResearchEnabled}
          onSaveHistoryChange={(enabled) => void handleSaveHistoryChange(enabled)}
          saveHistorySaving={savingPreference}
          onModelFilterChange={setModelFilter}
          onToggleModel={toggleModel}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {activityNarrow && activityOpen ? (
        <button
          aria-label="Close run details"
          className="activity-scrim"
          type="button"
          onClick={() => setActivityOpen(false)}
        />
      ) : null}

      <ActivityPanel
        result={activeRunDetails}
        models={models}
        running={running}
        statusLog={run.statusLog}
        open={activityOpen}
        modal={activityNarrow && activityOpen}
        activityEndRef={activityEndRef}
        onClose={() => setActivityOpen(false)}
      />
    </main>
  );
}
