import { describe, expect, it } from "vitest";
import { validateCouncilInput } from "@/lib/council/input";
import { MAX_ATTACHMENT_COUNT, MAX_COUNCIL_MODELS, MAX_PROMPT_CHARACTERS } from "@/lib/limits";
import type { CouncilRunInput } from "@/lib/types";

const validInput: CouncilRunInput = {
  prompt: "Compare these options.",
  models: ["model-a"],
  judgeModel: "judge-a",
  debateDepth: 1,
  researchEnabled: false,
  saveHistory: true
};

describe("validateCouncilInput", () => {
  it("accepts a complete valid input", () => {
    expect(() => validateCouncilInput(validInput)).not.toThrow();
  });

  it.each([
    [{ prompt: " " }, "Prompt is required"],
    [{ prompt: "x".repeat(MAX_PROMPT_CHARACTERS + 1) }, "Prompt must be at most"],
    [{ models: [] }, "Choose at least one"],
    [{ models: Array.from({ length: MAX_COUNCIL_MODELS + 1 }, (_, index) => `model-${index}`) }, "Choose at most"],
    [{ models: ["model-a", "model-a"] }, "must be unique"],
    [{ judgeModel: " " }, "Judge model is required"],
    [{ debateDepth: 0 }, "Debate depth must be an integer"],
    [{ attachmentIds: Array.from({ length: MAX_ATTACHMENT_COUNT + 1 }, (_, index) => `file-${index}`) }, "Attach at most"],
    [{ attachmentIds: ["file-a", "file-a"] }, "Attached files must be unique"]
  ])("rejects invalid input %o", (overrides, message) => {
    expect(() => validateCouncilInput({ ...validInput, ...overrides })).toThrow(message);
  });
});
