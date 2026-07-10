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
import type { ChatSummary, ThreadPayload } from "@/components/council-workspace/types";
import { requestJson } from "@/lib/client-api";
import { MAX_COUNCIL_MODELS } from "@/lib/limits";
import type { ModelOption } from "@/lib/types";

export type LoadThreadOptions = {
  clear?: boolean;
};

export function useWorkspaceData({
  initialThreadId,
  running,
  onError,
  onClearError
}: {
  initialThreadId?: string;
  running: boolean;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  const router = useRouter();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([...DEFAULT_COUNCIL]);
  const [judgeModel, setJudgeModel] = useState(DEFAULT_JUDGE);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [threadLoading, setThreadLoading] = useState(Boolean(initialThreadId));
  const threadAbortRef = useRef<AbortController | null>(null);
  const threadRequestIdRef = useRef(0);

  const loadModels = useCallback(async (signal?: AbortSignal) => {
    try {
      const body = await requestJson<{ models: ModelOption[] }>("/api/models", { signal });
      setModels(body.models);
      setSelectedModels((current) => reconcileCouncilModels(current, body.models));
      setJudgeModel((current) => reconcileJudgeModel(current, body.models));
    } catch (error) {
      if (!isAbortError(error)) {
        onError(error instanceof Error ? error.message : "Could not load models.");
      }
    }
  }, [onError]);

  const loadChats = useCallback(async (signal?: AbortSignal) => {
    try {
      const body = await requestJson<{ chats: ChatSummary[] }>("/api/chats", { signal });
      setChats(body.chats);
    } catch (error) {
      if (!isAbortError(error)) {
        onError(error instanceof Error ? error.message : "Could not load chats.");
      }
    }
  }, [onError]);

  const loadThread = useCallback(async (
    threadId: string,
    { clear = false }: LoadThreadOptions = {}
  ): Promise<ThreadPayload | null> => {
    const requestId = ++threadRequestIdRef.current;
    threadAbortRef.current?.abort();
    const controller = new AbortController();
    threadAbortRef.current = controller;
    if (clear) setThread(null);
    setThreadLoading(true);

    try {
      const body = await requestJson<ThreadPayload>(`/api/chats/${threadId}`, {
        signal: controller.signal
      });
      if (threadRequestIdRef.current !== requestId) return null;
      setThread(body);
      return body;
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
  };
}
