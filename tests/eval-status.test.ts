import { describe, expect, it } from "vitest";
import { applyEvalEvent, emptyLiveEvalState } from "@/components/eval-dashboard/read-eval-stream";
import { canResumeEval, evalNoticeClass, formatEvalStatus } from "@/components/eval-dashboard/eval-status";

describe("eval status labels", () => {
  it("shows scored progress for partial runs", () => {
    expect(formatEvalStatus("partial", 2, 5)).toBe("partial (2/5)");
    expect(formatEvalStatus("complete", 5, 5)).toBe("complete");
  });

  it("treats failed runs with leftover prompts as resumable", () => {
    expect(canResumeEval("partial", 2, 5)).toBe(true);
    expect(canResumeEval("failed", 1, 4)).toBe(true);
    expect(canResumeEval("complete", 4, 4)).toBe(false);
    expect(canResumeEval("failed", 0, 0)).toBe(false);
  });

  it("does not style in-progress notices as success", () => {
    expect(evalNoticeClass("status")).toBe("muted");
    expect(evalNoticeClass("success")).toBe("success-text");
    expect(evalNoticeClass("error")).toBe("error-text");
  });
});

describe("live eval events", () => {
  it("accumulates scores without assuming contiguous indexes", () => {
    const started = applyEvalEvent(emptyLiveEvalState, {
      type: "started",
      evalRunId: "eval-1",
      total: 3,
      completed: 1
    });
    const scored = applyEvalEvent(started, {
      type: "item_scored",
      evalRunId: "eval-1",
      itemIndex: 2,
      total: 3,
      prompt: "Third",
      score: 70,
      rationale: "Fine",
      finalAnswer: "Answer"
    });

    expect(scored.completed).toBe(1);
    expect(scored.scores.map((score) => score.itemIndex)).toEqual([2]);
  });
});
