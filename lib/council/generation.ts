import type { CouncilStage } from "@/lib/types";

export type CouncilGenerationStage = Extract<
  CouncilStage,
  "initial_answer" | "debate_critique" | "revision" | "judge_synthesis"
>;

export type CouncilGenerationConfig = Readonly<{
  temperature: number;
  maxTokens: number;
  responseFormat?: "json_object";
}>;

export const COUNCIL_GENERATION_BY_STAGE = {
  initial_answer: { temperature: 0.55, maxTokens: 1800 },
  debate_critique: { temperature: 0.45, maxTokens: 1400 },
  revision: { temperature: 0.35, maxTokens: 1800 },
  judge_synthesis: { temperature: 0.2, maxTokens: 2200, responseFormat: "json_object" }
} as const satisfies Readonly<Record<CouncilGenerationStage, CouncilGenerationConfig>>;

export function withoutResponseFormat(config: CouncilGenerationConfig): CouncilGenerationConfig {
  return {
    temperature: config.temperature,
    maxTokens: config.maxTokens
  };
}
