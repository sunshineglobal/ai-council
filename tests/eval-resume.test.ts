import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { buildEvalResumeState, parseEvalSetItems } from "@/lib/evals/resume";
import { parseEvalRequest } from "@/lib/validation";

describe("parseEvalRequest", () => {
  it("treats an evalRunId-only body as a resume", () => {
    expect(parseEvalRequest({ evalRunId: "00000000-0000-4000-8000-000000000001" })).toEqual({
      kind: "resume",
      evalRunId: "00000000-0000-4000-8000-000000000001"
    });
  });

  it("parses a new eval run", () => {
    const parsed = parseEvalRequest({
      name: "Check",
      rubric: "Be useful.",
      items: [{ prompt: "Why?" }],
      models: ["model-a"],
      judgeModel: "judge-a",
      debateDepth: 1,
      researchEnabled: false
    });
    expect(parsed.kind).toBe("create");
    if (parsed.kind === "create") expect(parsed.input.name).toBe("Check");
  });
});

describe("eval resume state", () => {
  it("rebuilds remaining work from a partial run", () => {
    const resume = buildEvalResumeState({
      id: "eval-1",
      status: "partial",
      baseline_label: "3-model",
      council_config: {
        models: ["model-a"],
        judgeModel: "judge-a",
        debateDepth: 2,
        researchEnabled: false
      },
      eval_sets: {
        name: "Quality",
        rubric: "Score carefully.",
        items: [{ prompt: "One" }, { prompt: "Two" }]
      },
      eval_scores: [{ item_index: 0, score: 81 }]
    });

    expect(resume.completedIndexes).toEqual([0]);
    expect(resume.scores).toEqual([81]);
    expect(resume.input.items).toEqual([{ prompt: "One" }, { prompt: "Two" }]);
    expect(resume.input.debateDepth).toBe(2);
  });

  it("rejects complete and still-running evals", () => {
    expect(() => buildEvalResumeState(row({ status: "complete" }))).toThrow(ApiError);
    expect(() => buildEvalResumeState(row({ status: "running" }))).toThrow(/still running/);
  });

  it("reads prompt items from stored eval sets", () => {
    expect(parseEvalSetItems([{ prompt: "  Hello  " }, { prompt: "" }, "nope"])).toEqual([{ prompt: "Hello" }]);
  });
});

function row(overrides: { status: string }) {
  return {
    id: "eval-1",
    status: overrides.status,
    baseline_label: null,
    council_config: {
      models: ["model-a"],
      judgeModel: "judge-a",
      debateDepth: 1,
      researchEnabled: false
    },
    eval_sets: {
      name: "Quality",
      rubric: "Score carefully.",
      items: [{ prompt: "One" }, { prompt: "Two" }]
    },
    eval_scores: [{ item_index: 0, score: 50 }]
  };
}
