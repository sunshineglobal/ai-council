import { describe, expect, it } from "vitest";
import { canUsePrivateCouncilCache, createCouncilCacheKey } from "@/lib/council/cache";
import { JudgeOutputValidationError, parseJudgeOutput } from "@/lib/council/judge-output";
import { buildCritiqueMessages, buildInitialMessages, buildJudgePrompt } from "@/lib/council/prompts";
import type { CritiqueResult, StageResult } from "@/lib/types";

describe("council cache keys", () => {
  it("is stable for the same complete input", () => {
    const input = cacheInput("user-a", "A complete prompt");
    expect(createCouncilCacheKey(input)).toBe(createCouncilCacheKey(input));
  });

  it("scopes private outputs by user", () => {
    expect(createCouncilCacheKey(cacheInput("user-a", "same prompt"))).not.toBe(
      createCouncilCacheKey(cacheInput("user-b", "same prompt"))
    );
  });

  it("hashes content beyond the first 500 characters", () => {
    const prefix = "x".repeat(500);
    expect(createCouncilCacheKey(cacheInput("user-a", `${prefix}A`))).not.toBe(
      createCouncilCacheKey(cacheInput("user-a", `${prefix}B`))
    );
  });

  it("does not cache ephemeral runs", () => {
    expect(canUsePrivateCouncilCache(false)).toBe(false);
    expect(canUsePrivateCouncilCache(true)).toBe(true);
  });
});

describe("council prompt builders", () => {
  it("keeps research, attachment, and user input in the shared initial prompt", () => {
    const messages = buildInitialMessages("Explain the result", "Research source [1]", "notes.txt: private context");
    const content = messages.map((message) => String(message.content)).join("\n");

    expect(content).toContain("Research source [1]");
    expect(content).toContain("notes.txt: private context");
    expect(content).toContain("Explain the result");
  });

  it("includes earlier answers and debate rounds in critique prompts", () => {
    const messages = buildCritiqueMessages({
      modelId: "model-a",
      prompt: "Question",
      researchContext: "",
      attachmentContext: "",
      initialResponses: [stageResult("model-a", "Own answer"), stageResult("model-b", "Peer answer")],
      previousRounds: [[critiqueResult("model-b", "Earlier critique")]],
      roundIndex: 2
    });
    const content = messages.map((message) => String(message.content)).join("\n");

    expect(content).toContain("model-a (you)");
    expect(content).toContain("Peer answer");
    expect(content).toContain("Earlier critique");
    expect(content).toContain("debate round 2");
  });

  it("preserves the structured judge response contract", () => {
    const prompt = buildJudgePrompt({
      initialResponses: [stageResult("model-a", "Initial")],
      critiqueRounds: [[critiqueResult("model-a", "Critique")]],
      revisions: [stageResult("model-a", "Revision", "revision")]
    });

    expect(prompt).toContain('"final_answer"');
    expect(prompt).toContain('"rankings"');
    expect(prompt).toContain("Revision");
  });
});

describe("judge output parsing", () => {
  it("validates and normalizes fenced structured output", () => {
    const parsed = parseJudgeOutput(
      `\`\`\`json
      {
        "final_answer": "Final answer",
        "consensus": "Shared view",
        "disagreements": ["One caveat"],
        "blind_spots": [],
        "rankings": [
          { "model_id": "model-a", "rank": 1, "score": 91, "rationale": "Strongest" }
        ]
      }
      \`\`\``,
      ["model-a"]
    );

    expect(parsed.synthesis).toContain("Final answer");
    expect(parsed.synthesis).toContain("Consensus\nShared view");
    expect(parsed.rankings).toEqual([
      { modelId: "model-a", rank: 1, score: 91, rationale: "Strongest" }
    ]);
  });

  it("rejects malformed scores and models outside the run", () => {
    expect(() =>
      parseJudgeOutput(
        JSON.stringify({
          final_answer: "Answer",
          rankings: [{ model_id: "model-a", rank: 1, score: 101, rationale: "Too high" }]
        }),
        ["model-a"]
      )
    ).toThrow(JudgeOutputValidationError);

    expect(() =>
      parseJudgeOutput(
        JSON.stringify({
          final_answer: "Answer",
          rankings: [{ model_id: "model-b", rank: 1, score: 90, rationale: "Unknown" }]
        }),
        ["model-a"]
      )
    ).toThrow("not in this council run");
  });
});

function cacheInput(userId: string, prompt: string) {
  return {
    userId,
    stage: "initial_answer" as const,
    modelId: "model-a",
    messages: [{ role: "user" as const, content: prompt }],
    generation: { temperature: 0.55, maxTokens: 1800 }
  };
}

function stageResult(modelId: string, content: string, stage: StageResult["stage"] = "initial_answer"): StageResult {
  return {
    id: `${modelId}-${stage}`,
    modelId,
    stage,
    content,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    latencyMs: 1,
    status: "complete"
  };
}

function critiqueResult(modelId: string, content: string): CritiqueResult {
  return {
    id: `${modelId}-critique`,
    roundIndex: 1,
    modelId,
    content,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    latencyMs: 1,
    status: "complete"
  };
}
