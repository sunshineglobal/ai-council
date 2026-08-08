"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_COUNCIL,
  DEFAULT_JUDGE,
  reconcileCouncilModels,
  reconcileJudgeModel
} from "@/components/council-workspace/model-selection";
import { isAbortError } from "@/components/council-workspace/request-utils";
import type { ChatSummary, ThreadDetailsPage, ThreadPayload } from "@/components/council-workspace/types";
import { requestJson } from "@/lib/client-api";
import { MAX_COUNCIL_MODELS } from "@/lib/limits";
import type { ModelOption } from "@/lib/types";
import {
  filterAvailableModelIds,
  readWorkspacePreferences,
  writeWorkspacePreferences
} from "@/lib/workspace-preferences";

export type LoadThreadOptions = {
  clear?: boolean;
};

export function useWorkspaceData({
  initialThreadId,
  running,
  debateDepth,
  researchEnabled,
  onDebateDepthChange,
  onResearchEnabledChange,
  onError,
  onClearError
}: {
  initialThreadId?: string;
  running: boolean;
  debateDepth: number;
  researchEnabled: boolean;
  onDebateDepthChange: (depth: number) => void;
  onResearchEnabledChange: (enabled: boolean) => void;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  const router = useRouter();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [researchAvailable, setResearchAvailable] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([...DEFAULT_COUNCIL]);
  const [judgeModel, setJudgeModel] = useState(DEFAULT_JUDGE);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatsCursor, setChatsCursor] = useState<string | null>(null);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [olderRunsCursor, setOlderRunsCursor] = useState<string | null>(null);
  const [loadingOlderRuns, setLoadingOlderRuns] = useState(false);
  const [threadLoading, setThreadLoading] = useState(Boolean(initialThreadId));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const threadAbortRef = useRef<AbortController | null>(null);
  const threadRequestIdRef = useRef(0);

  const loadModels = useCallback(async (signal?: AbortSignal) => {
    try {
      const body = await requestJson<{ models: ModelOption[]; researchAvailable: boolean }>("/api/models", { signal });
      setModels(body.models);
      setResearchAvailable(body.researchAvailable);

      const availableIds = new Set(body.models.map((model) => model.id));
      const stored = readWorkspacePreferences();
      if (stored) {
        const preferredModels = filterAvailableModelIds(stored.models, availableIds);
        setSelectedModels(reconcileCouncilModels(preferredModels.length ? preferredModels : [...DEFAULT_COUNCIL], body.models));
        setJudgeModel(reconcileJudgeModel(stored.judgeModel, body.models));
        onDebateDepthChange(Math.min(4, Math.max(1, stored.debateDepth)));
        onResearchEnabledChange(Boolean(stored.researchEnabled && body.researchAvailable));
      } else {
        setSelectedModels((current) => reconcileCouncilModels(current, body.models));
        setJudgeModel((current) => reconcileJudgeModel(current, body.models));
      }
      setPreferencesReady(true);
    } catch (error) {
      if (!isAbortError(error)) {
        onError(error instanceof Error ? error.message : "Could not load models.");
      }
      setPreferencesReady(true);
    }
  }, [onDebateDepthChange, onError, onResearchEnabledChange]);

  const loadChats = useCallback(async (signal?: AbortSignal) => {
    try {
      const body = await requestJson<{ chats: ChatSummary[]; nextCursor: string | null }>("/api/chats", { signal });
      setChats(body.chats);
      setChatsCursor(body.nextCursor);
    } catch (error) {
      if (!isAbortError(error)) {
        onError(error instanceof Error ? error.message : "Could not load chats.");
      }
    }
  }, [onError]);

  const loadMoreChats = useCallback(async () => {
    if (!chatsCursor || loadingMoreChats) return;
    setLoadingMoreChats(true);
    try {
      const body = await requestJson<{ chats: ChatSummary[]; nextCursor: string | null }>(
        `/api/chats?cursor=${encodeURIComponent(chatsCursor)}`
      );
      setChats((current) => {
        const seen = new Set(current.map((chat) => chat.id));
        return [...current, ...body.chats.filter((chat) => !seen.has(chat.id))];
      });
      setChatsCursor(body.nextCursor);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load more chats.");
    } finally {
      setLoadingMoreChats(false);
    }
  }, [chatsCursor, loadingMoreChats, onError]);

  const loadThread = useCallback(async (
    threadId: string,
    { clear = false }: LoadThreadOptions = {}
  ): Promise<ThreadPayload | null> => {
    const requestId = ++threadRequestIdRef.current;
    threadAbortRef.current?.abort();
    const controller = new AbortController();
    threadAbortRef.current = controller;
    if (clear) {
      setThread(null);
      setOlderRunsCursor(null);
    }
    setThreadLoading(true);

    try {
      const body = await requestJson<ThreadDetailsPage>(`/api/chats/${threadId}`, {
        signal: controller.signal
      });
      if (threadRequestIdRef.current !== requestId) return null;
      const { nextOlderCursor, hasOlder: _hasOlder, ...payload } = body;
      setThread(payload);
      setOlderRunsCursor(nextOlderCursor);
      return payload;
    } catch (error) {
      if (!isAbortError(error) && threadRequestIdRef.current === requestId) {
        onError(error instanceof Error ? error.message : "Could not load conversation.");
      }
      return null;
    } finally {
      if (threadRequestIdRef.current === requestId) {
        setThreadLoading(false);
        if (threadAbortRef.current === controller) threadAbortRef.current = null;
      }
    }
  }, [onError]);

  const loadOlderRuns = useCallback(async () => {
    if (!initialThreadId || !olderRunsCursor || loadingOlderRuns) return;
    setLoadingOlderRuns(true);
    try {
      const body = await requestJson<ThreadDetailsPage>(
        `/api/chats/${initialThreadId}?cursor=${encodeURIComponent(olderRunsCursor)}`
      );
      setThread((current) => {
        if (!current) {
          const { nextOlderCursor: _cursor, hasOlder: _hasOlder, ...payload } = body;
          return payload;
        }
        const runIds = new Set(current.runs.map((run) => run.id));
        const responseIds = new Set(current.responses.map((item) => item.id));
        const critiqueIds = new Set(current.critiques.map((item) => item.id));
        const judgeIds = new Set(current.judges.map((item) => item.id));
        return {
          thread: current.thread,
          runs: [...body.runs.filter((run) => !runIds.has(run.id)), ...current.runs],
          responses: [
            ...body.responses.filter((item) => !responseIds.has(item.id)),
            ...current.responses
          ],
          critiques: [
            ...body.critiques.filter((item) => !critiqueIds.has(item.id)),
            ...current.critiques
          ],
          judges: [
            ...body.judges.filter((item) => !judgeIds.has(item.id)),
            ...current.judges
          ],
          research: [...body.research, ...current.research],
          usage: [...body.usage, ...current.usage],
          attachments: [...body.attachments, ...current.attachments]
        };
      });
      setOlderRunsCursor(body.nextOlderCursor);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load earlier messages.");
    } finally {
      setLoadingOlderRuns(false);
    }
  }, [initialThreadId, loadingOlderRuns, olderRunsCursor, onError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadModels(controller.signal);
    void loadChats(controller.signal);
    return () => controller.abort();
  }, [loadChats, loadModels]);

  useEffect(() => {
    setThread(null);
    if (initialThreadId) {
      void loadThread(initialThreadId, { clear: true });
    } else {
      setThreadLoading(false);
    }

    return () => {
      threadRequestIdRef.current += 1;
      threadAbortRef.current?.abort();
      threadAbortRef.current = null;
    };
  }, [initialThreadId, loadThread]);

  useEffect(() => {
    if (!preferencesReady || !selectedModels.length || !judgeModel) return;
    writeWorkspacePreferences({
      models: selectedModels,
      judgeModel,
      debateDepth,
      researchEnabled
    });
  }, [debateDepth, judgeModel, preferencesReady, researchEnabled, selectedModels]);

  const deleteChat = useCallback(async (chatId: string) => {
    const previousChats = chats;
    const chat = previousChats.find((item) => item.id === chatId);
    if (!chat || deletingChatId) return;
    if (!window.confirm(`Delete "${chat.title}"? This removes the saved conversation.`)) return;

    setDeletingChatId(chatId);
    onClearError();
    setChats((current) => current.filter((item) => item.id !== chatId));

    try {
      await requestJson<{ ok: true }>(`/api/chats/${chatId}`, { method: "DELETE" });
      if (initialThreadId === chatId) {
        router.push("/app");
      } else {
        router.refresh();
      }
    } catch (error) {
      setChats(previousChats);
      onError(error instanceof Error ? error.message : "Could not delete chat.");
    } finally {
      setDeletingChatId(null);
    }
  }, [chats, deletingChatId, initialThreadId, onClearError, onError, router]);

  const renameChat = useCallback(async (chatId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      onError("Chat title is required.");
      return false;
    }

    const previousChats = chats;
    const previousThread = thread;
    setRenamingChatId(chatId);
    onClearError();
    setChats((current) => current.map((chat) => (
      chat.id === chatId ? { ...chat, title: nextTitle, updated_at: new Date().toISOString() } : chat
    )));
    if (thread?.thread.id === chatId) {
      setThread({ ...thread, thread: { ...thread.thread, title: nextTitle } });
    }

    try {
      const body = await requestJson<{ chat: ChatSummary }>(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle })
      });
      setChats((current) => current.map((chat) => (chat.id === chatId ? body.chat : chat)));
      if (thread?.thread.id === chatId) {
        setThread((current) => (
          current ? { ...current, thread: { ...current.thread, title: body.chat.title } } : current
        ));
      }
      return true;
    } catch (error) {
      setChats(previousChats);
      setThread(previousThread);
      onError(error instanceof Error ? error.message : "Could not rename chat.");
      return false;
    } finally {
      setRenamingChatId(null);
    }
  }, [chats, onClearError, onError, thread]);

  const toggleModel = useCallback((modelId: string) => {
    if (running) return;
    setSelectedModels((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      if (current.length >= MAX_COUNCIL_MODELS) return current;
      return [...current, modelId];
    });
  }, [running]);

  return {
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
  };
}
