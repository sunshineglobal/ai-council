import { describe, expect, it } from "vitest";
import {
  buildLiveRunResult,
  initialLiveRunState,
  liveRunReducer
} from "@/components/council-workspace/live-run-state";
import {
  DEFAULT_COUNCIL,
  DEFAULT_JUDGE,
  isDefaultCouncil,
  reconcileCouncilModels,
  reconcileJudgeModel
} from "@/components/council-workspace/model-selection";
import { normalizeStoredAttachment, parseCouncilAnswer } from "@/components/council-workspace/result-utils";
import {
  initialResponsiveSidebarState,
  isResponsiveSidebarOpen,
  responsiveSidebarReducer
} from "@/components/council-workspace/use-responsive-sidebar";
import type { CritiqueResult, ModelOption } from "@/lib/types";

const config = {
  models: ["model-a", "model-b"],
  judgeModel: "judge-a",
  debateDepth: 2,
  researchEnabled: true,
  saveHistory: true,
  threadId: "thread-a"
};

describe("workspace model defaults", () => {
  it("keeps available defaults and falls back to the first models when none remain", () => {
    const partialDefaults = models(DEFAULT_COUNCIL[1], "model-a", "model-b");
    expect(reconcileCouncilModels([...DEFAULT_COUNCIL], partialDefaults)).toEqual([DEFAULT_COUNCIL[1]]);
    expect(reconcileCouncilModels([...DEFAULT_COUNCIL], models("model-a", "model-b", "model-c", "model-d")))
      .toEqual(["model-a", "model-b", "model-c"]);
  });

  it("keeps available custom choices and falls back when they disappear", () => {
    const available = models(DEFAULT_JUDGE, "judge-b", "custom-model");
    expect(reconcileCouncilModels(["custom-model"], available)).toEqual(["custom-model"]);
    expect(reconcileCouncilModels(["missing-model"], models("judge-b", "model-a"))).toEqual(["judge-b", "model-a"]);
    expect(reconcileJudgeModel(DEFAULT_JUDGE, available)).toBe(DEFAULT_JUDGE);
    expect(reconcileJudgeModel(DEFAULT_JUDGE, models("judge-b"))).toBe("judge-b");
    expect(reconcileJudgeModel("custom-judge", available)).toBe(DEFAULT_JUDGE);
    expect(reconcileJudgeModel("judge-b", available)).toBe("judge-b");
    expect(isDefaultCouncil([...DEFAULT_COUNCIL])).toBe(true);
    expect(isDefaultCouncil([...DEFAULT_COUNCIL].reverse())).toBe(false);
  });
});

describe("responsive sidebar state", () => {
  it("defaults open inline and closed when entering overlay mode", () => {
    expect(isResponsiveSidebarOpen(initialResponsiveSidebarState)).toBe(true);

    const overlay = responsiveSidebarReducer(initialResponsiveSidebarState, {
      type: "viewport_changed",
      overlay: true
    });

    expect(overlay.mode).toBe("overlay");
    expect(isResponsiveSidebarOpen(overlay)).toBe(false);
  });

  it("preserves the desktop preference while closing each newly entered overlay", () => {
    const collapsedInline = responsiveSidebarReducer(initialResponsiveSidebarState, { type: "close" });
    const overlay = responsiveSidebarReducer(collapsedInline, { type: "viewport_changed", overlay: true });
    const openOverlay = responsiveSidebarReducer(overlay, { type: "open" });
    const repeatedOverlay = responsiveSidebarReducer(openOverlay, { type: "viewport_changed", overlay: true });
    const inlineAgain = responsiveSidebarReducer(repeatedOverlay, { type: "viewport_changed", overlay: false });
    const overlayAgain = responsiveSidebarReducer(inlineAgain, { type: "viewport_changed", overlay: true });

    expect(isResponsiveSidebarOpen(openOverlay)).toBe(true);
    expect(repeatedOverlay).toBe(openOverlay);
    expect(isResponsiveSidebarOpen(inlineAgain)).toBe(false);
    expect(isResponsiveSidebarOpen(overlayAgain)).toBe(false);
  });
});

describe("live run progress visibility", () => {
  it("keeps stopped runs idle without a result so the UI can hide thinking chrome", () => {
    const running = liveRunReducer(initialLiveRunState, {
      type: "start",
      prompt: "Decide",
      attachments: [],
      config,
      startedAt: "2026-08-08T00:00:00.000Z"
    });
    const stopping = liveRunReducer(running, { type: "stop_requested" });
    const stopped = liveRunReducer(stopping, { type: "stopped" });
    expect(stopped.phase).toBe("idle");
    expect(stopped.result).toBeNull();
    expect(stopped.error).toBe("");
    expect(stopped.statusLog.at(-1)).toBe("Council run stopped.");
    expect(buildLiveRunResult(stopped)).toBeNull();
  });
});

describe("live run reducer", () => {
  it("snapshots submitted configuration and builds live details from it", () => {
    const submittedModels = [...config.models];
    const state = liveRunReducer(initialLiveRunState, {
      type: "start",
      prompt: "Compare the options",
      attachments: [],
      config: { ...config, models: submittedModels },
      startedAt: "2026-07-10T00:00:00.000Z"
    });

    submittedModels.push("model-c");
    const result = buildLiveRunResult(state);

    expect(state.config?.models).toEqual(["model-a", "model-b"]);
    expect(result?.models).toEqual(["model-a", "model-b"]);
    expect(result?.judgeModel).toBe("judge-a");
    expect(result?.createdAt).toBe("2026-07-10T00:00:00.000Z");
  });

  it("updates critique rounds without mutating previous reducer snapshots", () => {
    const started = liveRunReducer(initialLiveRunState, {
      type: "start",
      prompt: "Review",
      attachments: [],
      config,
      startedAt: "2026-07-10T00:00:00.000Z"
    });
    const original = critique("first");
    const first = liveRunReducer(started, { type: "event", event: { type: "critique", critique: original } });
    const second = liveRunReducer(first, {
      type: "event",
      event: { type: "critique", critique: critique("revised") }
    });

    expect(second.critiqueRounds).not.toBe(first.critiqueRounds);
    expect(second.critiqueRounds[0]).not.toBe(first.critiqueRounds[0]);
    expect(first.critiqueRounds[0][0].content).toBe("first");
    expect(second.critiqueRounds[0][0].content).toBe("revised");
  });

  it("records stop state once and returns to idle", () => {
    const started = liveRunReducer(initialLiveRunState, {
      type: "start",
      prompt: "Review",
      attachments: [],
      config,
      startedAt: "2026-07-10T00:00:00.000Z"
    });
    const stopping = liveRunReducer(started, { type: "stop_requested" });
    const stopped = liveRunReducer(stopping, { type: "stopped" });

    expect(stopping.phase).toBe("stopping");
    expect(stopped.phase).toBe("idle");
    expect(stopped.statusLog.at(-1)).toBe("Council run stopped.");
  });
});

describe("council answer parsing", () => {
  it("normalizes structured judge output", () => {
    expect(parseCouncilAnswer(JSON.stringify({
      final_answer: "Choose option A.",
      consensus: "A is safest.",
      disagreements: ["Timing"],
      blind_spots: ["Migration cost"]
    }))).toEqual({
      mainAnswer: "Choose option A.",
      consensus: "A is safest.",
      disagreements: ["Timing"],
      blindSpots: ["Migration cost"]
    });
  });
});

describe("stored attachment normalization", () => {
  it("prefers file_id for download identity and keeps extraction errors", () => {
    expect(normalizeStoredAttachment({
      id: "join-row",
      file_id: "file-123",
      filename: "notes.md",
      content_type: "text/markdown",
      file_size: 12,
      text_preview: "hello",
      extraction_status: "failed",
      extraction_error: "decode failed",
      created_at: "2026-08-08T00:00:00.000Z"
    })).toMatchObject({
      id: "file-123",
      extractionStatus: "failed",
      extractionError: "decode failed"
    });
  });
});

describe("live run error handling", () => {
  it("keeps the prompt available after an error event for retry", () => {
    const running = liveRunReducer(initialLiveRunState, {
      type: "start",
      prompt: "Retry me",
      attachments: [],
      config,
      startedAt: "2026-08-08T00:00:00.000Z"
    });
    const failed = liveRunReducer(running, {
      type: "event",
      event: { type: "error", message: "Council run failed.", threadId: "thread-a", runId: "run-a" }
    });
    expect(failed.prompt).toBe("Retry me");
    expect(failed.error).toBe("Council run failed.");
  });
});

function critique(content: string): CritiqueResult {
  return {
    id: "critique-a",
    roundIndex: 1,
    modelId: "model-a",
    content,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latencyMs: 20,
    status: "complete"
  };
}

function models(...ids: string[]): ModelOption[] {
  return ids.map((id) => ({ id, name: id }));
}
