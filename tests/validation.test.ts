import { describe, expect, it } from "vitest";
import { councilRunSchema } from "@/lib/validation";

describe("council run validation", () => {
  it("accepts a valid council run", () => {
    expect(() =>
      councilRunSchema.parse({
        prompt: "Hello",
        models: ["model-a", "model-b"],
        judgeModel: "judge",
        debateDepth: 2,
        researchEnabled: true,
        saveHistory: false
      })
    ).not.toThrow();
  });

  it("rejects too many models and invalid debate depth", () => {
    expect(() =>
      councilRunSchema.parse({
        prompt: "Hello",
        models: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
        judgeModel: "judge",
        debateDepth: 5,
        researchEnabled: false,
        saveHistory: true
      })
    ).toThrow();
  });
});
