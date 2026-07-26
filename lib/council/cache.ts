import { createHash } from "node:crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { TtlCache } from "@/lib/cache";
import type { CouncilGenerationConfig } from "@/lib/council/generation";
import type { CouncilStage, CritiqueResult, JudgeResult, StageResult } from "@/lib/types";

const PRIVATE_OUTPUT_CACHE_VERSION = "council-private-output-v2";

export const initialAnswerCache = new TtlCache<string, StageResult>(15 * 60 * 1000, 128);
export const critiqueCache = new TtlCache<string, CritiqueResult>(15 * 60 * 1000, 192);
export const revisionCache = new TtlCache<string, StageResult>(15 * 60 * 1000, 128);
export const judgeCache = new TtlCache<string, JudgeResult>(15 * 60 * 1000, 64);

export function canUsePrivateCouncilCache(saveHistory: boolean): boolean {
  return saveHistory;
}

export function createCouncilCacheKey(params: {
  userId: string;
  stage: CouncilStage;
  modelId: string;
  messages: ChatCompletionMessageParam[];
  generation: CouncilGenerationConfig;
}): string {
  const serialized = JSON.stringify({
    version: PRIVATE_OUTPUT_CACHE_VERSION,
    userId: params.userId,
    stage: params.stage,
    modelId: params.modelId,
    messages: params.messages,
    generation: params.generation
  });
  const digest = createHash("sha256").update(serialized, "utf8").digest("hex");

  return `${PRIVATE_OUTPUT_CACHE_VERSION}:${params.stage}:${digest}`;
}
