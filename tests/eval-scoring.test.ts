import { describe, expect, it } from "vitest";
import {
  buildEvalScoreMessages,
  parseEvalScoreOutput
} from "@/lib/evals/scoring";

describe("eval score prompt construction", () => {
  it("preserves the scorer instructions and input sections", () => {
    expect(
      buildEvalScoreMessages({
        prompt: "Explain the tradeoff",
        rubric: "Reward accuracy and clarity",
        answer: "A concise answer"
      })
    ).toEqual([
      {
        role: "system",
        content: "Score the answer from 0 to 100 against the rubric. Return JSON only."
      },
      {
        role: "user",
        content:
          "Prompt:\nExplain the tradeoff\n\nRubric:\nReward accuracy and clarity\n\nAnswer:\nA concise answer\n\nReturn {\"score\": number, \"rationale\": \"short explanation\"}."
      }
    ]);
  });
});

describe("eval score output parsing", () => {
  it("accepts bounded numeric scores and trims the rationale", () => {
    expect(parseEvalScoreOutput('{"score":87.5,"rationale":"  Meets the rubric  "}')).toEqual({
      score: 87.5,
      rationale: "Meets the rubric"
    });
  });

  it("falls back to zero and the raw response for invalid JSON", () => {
    const content = "not valid JSON";
    expect(parseEvalScoreOutput(content)).toEqual({ score: 0, rationale: content });
  });

  it("uses the same fallback for schema-invalid output", () => {
    const content = '{"score":101,"rationale":"Outside the allowed range"}';
    expect(parseEvalScoreOutput(content)).toEqual({ score: 0, rationale: content });
  });
});
