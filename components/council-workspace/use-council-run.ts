"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  initialLiveRunState,
  liveRunReducer
} from "@/components/council-workspace/live-run-state";
import { readCouncilEventStream } from "@/components/council-workspace/read-council-stream";
import { isAbortError, readResponseError } from "@/components/council-workspace/request-utils";
import type { SubmittedRunConfig, ThreadPayload } from "@/components/council-workspace/types";
import type { CouncilAttachment, CouncilEvent } from "@/lib/types";

type CouncilRunSubmission = {
  config: SubmittedRunConfig;
  attachments: CouncilAttachment[];
  uploading: boolean;
  clearAttachments: () => void;
  clearAttachmentError: () => void;
  loadChats: (signal?: AbortSignal) => Promise<void>;
  loadThread: (threadId: string) => Promise<ThreadPayload | null>;
};

export function useCouncilRun({ initialThreadId }: { initialThreadId?: string }) {
  const router = useRouter();
  const [run, dispatchRun] = useReducer(liveRunReducer, initialLiveRunState);
  const [prompt, setPrompt] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const runRequestIdRef = useRef(0);
  const activityScrollFrameRef = useRef<number | null>(null);
  const running = run.phase === "running" || run.phase === "stopping";
  const stopping = run.phase === "stopping";

  useEffect(() => {
    runRequestIdRef.current += 1;
    runAbortRef.current?.abort();
    runAbortRef.current = null;
    dispatchRun({ type: "reset" });
    setSelectedRunId(null);

    return () => {
      runRequestIdRef.current += 1;
      runAbortRef.current?.abort();
      runAbortRef.current = null;
      if (activityScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(activityScrollFrameRef.current);
        activityScrollFrameRef.current = null;
      }
    };
  }, [initialThreadId]);

  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 190)}px`;
  }, [prompt]);

  const handleCouncilEvent = useCallback((event: CouncilEvent) => {
    dispatchRun({ type: "event", event });
    if (event.type === "complete") setSelectedRunId(event.result.id);
    if (activityScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(activityScrollFrameRef.current);
    }
    activityScrollFrameRef.current = window.requestAnimationFrame(() => {
      activityScrollFrameRef.current = null;
      activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const submit = useCallback(async ({
    config: submittedConfig,
    attachments,
    uploading,
    clearAttachments,
    clearAttachmentError,
    loadChats,
    loadThread
  }: CouncilRunSubmission) => {
    const trimmedPrompt = prompt.trim();
    if (running || uploading || !trimmedPrompt || submittedConfig.models.length === 0 || !submittedConfig.judgeModel) {
      return;
    }

    const queuedAttachments = [...attachments];
    const config: SubmittedRunConfig = {
      ...submittedConfig,
      models: [...submittedConfig.models]
    };
    const controller = new AbortController();
    const requestId = ++runRequestIdRef.current;
    runAbortRef.current = controller;

    dispatchRun({
      type: "start",
      prompt: trimmedPrompt,
      attachments: queuedAttachments,
      config,
      startedAt: new Date().toISOString()
    });
    clearAttachmentError();
    setPrompt("");
    setSelectedRunId(null);
    window.requestAnimationFrame(() => promptRef.current?.focus());

    try {
      const response = await fetch("/api/council/runs/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          models: config.models,
          judgeModel: config.judgeModel,
          debateDepth: config.debateDepth,
          researchEnabled: config.researchEnabled,
          saveHistory: config.saveHistory,
          threadId: config.threadId,
          attachmentIds: queuedAttachments.map((attachment) => attachment.id)
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(await readResponseError(response));
      }

      clearAttachments();
      const outcome = await readCouncilEventStream(response.body, (event) => {
        if (runRequestIdRef.current !== requestId) return;
        handleCouncilEvent(event);
      });
      if (runRequestIdRef.current !== requestId) return;
      if (!outcome.terminal) {
        throw new Error("Council stream ended before a final result arrived. Check the Vercel runtime logs for the server error.");
      }

      if (config.saveHistory) {
        await loadChats(controller.signal);
        if (runRequestIdRef.current !== requestId) return;
        const completedThreadId = outcome.result?.threadId ?? config.threadId;
        if (!config.threadId && completedThreadId) {
          router.replace(`/app/chats/${completedThreadId}`);
          return;
        }
        if (completedThreadId && outcome.result) {
          const refreshedThread = await loadThread(completedThreadId);
          const includesCompletedRun = refreshedThread?.runs.some((storedRun) => storedRun.id === outcome.result?.id);
          if (includesCompletedRun && runRequestIdRef.current === requestId) {
            setSelectedRunId(outcome.result.id);
            dispatchRun({ type: "synced_to_thread" });
          }
        }
      }
    } catch (error) {
      if (runRequestIdRef.current !== requestId) return;
      if (isAbortError(error)) {
        dispatchRun({ type: "stopped" });
      } else {
        dispatchRun({
          type: "set_error",
          message: error instanceof Error ? error.message : "Council request failed."
        });
      }
    } finally {
      if (runRequestIdRef.current === requestId) {
        if (runAbortRef.current === controller) runAbortRef.current = null;
        dispatchRun({ type: "finish" });
      }
    }
  }, [handleCouncilEvent, prompt, router, running]);

  const stop = useCallback(() => {
    if (!running || stopping) return;
    dispatchRun({ type: "stop_requested" });
    runAbortRef.current?.abort();
  }, [running, stopping]);

  const reportError = useCallback((message: string) => {
    dispatchRun({ type: "set_error", message });
  }, []);

  const clearError = useCallback(() => {
    dispatchRun({ type: "clear_error" });
  }, []);

  return {
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
  };
}
