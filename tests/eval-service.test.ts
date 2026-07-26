import { describe, expect, it, vi } from "vitest";
import {
  runEval,
  type EvalServiceDependencies
} from "@/lib/evals/service";
import type { EvalRunInput } from "@/lib/evals/types";

const input: EvalRunInput = {
  name: "Decision quality",
  rubric: "Reward accurate, actionable answers.",
  items: [{ prompt: "Question A" }, { prompt: "Question B" }],
  models: ["model-a"],
  judgeModel: "judge-a",
  debateDepth: 1,
  researchEnabled: false
};

const profile = { id: "user-a", email: "user@example.com" };

describe("eval service orchestration", () => {
  it("persists each result and completes the run with the aggregate score", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.scoreAnswer)
      .mockResolvedValueOnce(score(80, "Strong"))
      .mockResolvedValueOnce(score(60, "Adequate"));

    await expect(runEval({ profile, input }, dependencies)).resolves.toEqual({
      evalRunId: "eval-run-a",
      aggregateScore: 70
    });

    expect(dependencies.runCouncil).toHaveBeenCalledTimes(2);
    expect(dependencies.persistUsage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: profile.id,
      metadata: { evalRunId: "eval-run-a", itemIndex: 0 }
    }));
    expect(dependencies.persistScore).toHaveBeenNthCalledWith(2, expect.objectContaining({
      evalRunId: "eval-run-a",
      itemIndex: 1,
      prompt: "Question B",
      score: 60,
      finalAnswer: "Answer for Question B"
    }));
    expect(dependencies.markComplete).toHaveBeenCalledWith(expect.objectContaining({
      evalRunId: "eval-run-a",
      aggregateScore: 70
    }));
    expect(dependencies.markFailed).not.toHaveBeenCalled();
  });

  it("marks an established run failed before rethrowing an orchestration error", async () => {
    const failure = new Error("scoring failed");
    const dependencies = createDependencies();
    vi.mocked(dependencies.scoreAnswer).mockRejectedValue(failure);

    await expect(runEval({ profile, input }, dependencies)).rejects.toBe(failure);

    expect(dependencies.markFailed).toHaveBeenCalledWith(expect.anything(), "eval-run-a");
    expect(dependencies.markComplete).not.toHaveBeenCalled();
  });

  it("does not attempt a failed-state update before a run id exists", async () => {
    const failure = new Error("could not create run");
    const dependencies = createDependencies();
    vi.mocked(dependencies.createRunRecords).mockRejectedValue(failure);

    await expect(runEval({ profile, input }, dependencies)).rejects.toBe(failure);

    expect(dependencies.markFailed).not.toHaveBeenCalled();
  });
});

function createDependencies(): EvalServiceDependencies {
  return {
    createAdminClient: () => ({}) as never,
    loadPricing: vi.fn(async () => ({
      "model-a": { prompt: "0.000001", completion: "0.000002" },
      "judge-a": { prompt: "0.000001", completion: "0.000002" }
    })),
    createRunRecords: vi.fn(async () => "eval-run-a"),
    runCouncil: vi.fn(async (councilInput) => ({
      finalAnswer: `Answer for ${councilInput.prompt}`
    })),
    scoreAnswer: vi.fn(async () => score(50, "Default score")),
    persistUsage: vi.fn(async () => undefined),
    persistScore: vi.fn(async () => undefined),
    markComplete: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => null)
  };
}

function score(value: number, rationale: string) {
  return {
    score: value,
    rationale,
    completion: {
      content: JSON.stringify({ score: value, rationale }),
      usage: { promptTokens: 12, completionTokens: 4, totalTokens: 16 },
      latencyMs: 25
    }
  };
}
