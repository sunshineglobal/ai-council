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
        saveHistory: false,
        attachmentIds: ["00000000-0000-4000-8000-000000000001"]
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

  it("rejects invalid attachment ids and too many attachments", () => {
    expect(() =>
      councilRunSchema.parse({
        prompt: "Hello",
        models: ["model-a"],
        judgeModel: "judge",
        debateDepth: 1,
        researchEnabled: false,
        saveHistory: true,
        attachmentIds: ["not-a-uuid"]
      })
    ).toThrow();

    expect(() =>
      councilRunSchema.parse({
        prompt: "Hello",
        models: ["model-a"],
        judgeModel: "judge",
        debateDepth: 1,
        researchEnabled: false,
        saveHistory: true,
        attachmentIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000003",
          "00000000-0000-4000-8000-000000000004",
          "00000000-0000-4000-8000-000000000005",
          "00000000-0000-4000-8000-000000000006"
        ]
      })
    ).toThrow();
  });
});
