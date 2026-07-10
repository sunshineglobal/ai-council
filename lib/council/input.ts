import {
  MAX_ATTACHMENT_COUNT,
  MAX_COUNCIL_DEBATE_ROUNDS,
  MAX_COUNCIL_MODELS,
  MAX_PROMPT_CHARACTERS
} from "@/lib/limits";
import type { CouncilRunInput } from "@/lib/types";

export function validateCouncilInput(input: CouncilRunInput): void {
  if (!input.prompt.trim()) throw new Error("Prompt is required.");
  if (input.prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new Error(`Prompt must be at most ${MAX_PROMPT_CHARACTERS} characters.`);
  }
  if (input.models.length < 1) throw new Error("Choose at least one council model.");
  if (input.models.length > MAX_COUNCIL_MODELS) {
    throw new Error(`Choose at most ${MAX_COUNCIL_MODELS} council models.`);
  }
  if (input.models.some((modelId) => !modelId.trim())) throw new Error("Council model ids cannot be blank.");
  if (new Set(input.models).size !== input.models.length) throw new Error("Council models must be unique.");
  if ((input.attachmentIds ?? []).length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`Attach at most ${MAX_ATTACHMENT_COUNT} files.`);
  }
  if ((input.attachmentIds ?? []).length !== new Set(input.attachmentIds ?? []).size) {
    throw new Error("Attached files must be unique.");
  }
  if (!input.judgeModel.trim()) throw new Error("Judge model is required.");
  if (
    !Number.isInteger(input.debateDepth) ||
    input.debateDepth < 1 ||
    input.debateDepth > MAX_COUNCIL_DEBATE_ROUNDS
  ) {
    throw new Error(`Debate depth must be an integer between 1 and ${MAX_COUNCIL_DEBATE_ROUNDS}.`);
  }
}
