import {
  canUsePrivateCouncilCache,
  createCouncilCacheKey,
  critiqueCache,
  initialAnswerCache,
  revisionCache
} from "@/lib/council/cache";
import { emitCouncilEvent as emit, type CouncilRunContext } from "@/lib/council/context";
import { COUNCIL_GENERATION_BY_STAGE } from "@/lib/council/generation";
import {
  persistCritique,
  persistModelResponse,
  type CouncilAdminClient
} from "@/lib/council/persistence";
import {
  buildCritiqueMessages,
  buildInitialMessages,
  buildRevisionMessages
} from "@/lib/council/prompts";
import { callCritiqueStage, callModelStage } from "@/lib/council/stages/model-runner";
import { reuseCachedResult } from "@/lib/council/stages/shared";
import type { ModelPricingMap } from "@/lib/usage";
import type {
  CouncilRunInput,
  CritiqueResult,
  StageResult,
  UsageEvent
} from "@/lib/types";

export async function runInitialStage(
  admin: CouncilAdminClient,
  input: CouncilRunInput,
  researchContext: string,
  attachmentContext: string,
  context: CouncilRunContext,
  runId: string,
  usageEvents: UsageEvent[],
  pricingByModel: ModelPricingMap
): Promise<StageResult[]> {
  await emit(context, { type: "stage", stage: "initial_answer", message: "Collecting initial answers." });

  return Promise.all(
    input.models.map(async (modelId) => {
      const messages = buildInitialMessages(input.prompt, researchContext, attachmentContext);
      const generation = COUNCIL_GENERATION_BY_STAGE.initial_answer;
      const cacheKey = createCouncilCacheKey({
        userId: context.userId,
        stage: "initial_answer",
        modelId,
        messages,
        generation
      });
      const cached = canUsePrivateCouncilCache(input.saveHistory) ? initialAnswerCache.get(cacheKey) : undefined;
      if (cached) {
        return reuseCachedResult({
          cached,
          admin,
          runId,
          userId: context.userId,
          stage: "initial_answer",
          modelId,
          message: `Using cached initial answer for ${modelId}.`,
          usageEvents,
          context,
          persistResult: (result) => persistModelResponse(admin, runId, input.saveHistory, result),
          emitResult: (result) => emit(context, { type: "model_response", response: result })
        });
      }

      const result = await callModelStage({
        admin,
        modelId,
        stage: "initial_answer",
        messages,
        generation,
        saveHistory: input.saveHistory,
        runId,
        userId: context.userId,
        usageEvents,
        pricingByModel,
        context
      });

      if (result.status === "complete" && canUsePrivateCouncilCache(input.saveHistory)) {
        initialAnswerCache.set(cacheKey, result);
      }
      return result;
    })
  );
}

export async function runCritiqueRound(params: {
  admin: CouncilAdminClient;
  input: CouncilRunInput;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  previousRounds: CritiqueResult[][];
  roundIndex: number;
  context: CouncilRunContext;
  runId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
}): Promise<CritiqueResult[]> {
  await emit(params.context, {
    type: "stage",
    stage: "debate_critique",
    message: `Running debate round ${params.roundIndex}.`
  });

  return Promise.all(
    params.input.models.map(async (modelId) => {
      const messages = buildCritiqueMessages({
        modelId,
        prompt: params.input.prompt,
        researchContext: params.researchContext,
        attachmentContext: params.attachmentContext,
        initialResponses: params.initialResponses,
        previousRounds: params.previousRounds,
        roundIndex: params.roundIndex
      });
      const generation = COUNCIL_GENERATION_BY_STAGE.debate_critique;
      const cacheKey = createCouncilCacheKey({
        userId: params.context.userId,
        stage: "debate_critique",
        modelId,
        messages,
        generation
      });
      const cached = canUsePrivateCouncilCache(params.input.saveHistory) ? critiqueCache.get(cacheKey) : undefined;
      if (cached) {
        return reuseCachedResult({
          cached,
          admin: params.admin,
          runId: params.runId,
          userId: params.context.userId,
          stage: "debate_critique",
          modelId,
          message: `Using cached debate critique for ${modelId}.`,
          usageEvents: params.usageEvents,
          context: params.context,
          persistResult: (result) => persistCritique(params.admin, params.runId, params.input.saveHistory, result),
          emitResult: (result) => emit(params.context, { type: "critique", critique: result })
        });
      }

      const result = await callCritiqueStage({
        admin: params.admin,
        modelId,
        messages,
        generation,
        saveHistory: params.input.saveHistory,
        roundIndex: params.roundIndex,
        runId: params.runId,
        userId: params.context.userId,
        usageEvents: params.usageEvents,
        pricingByModel: params.pricingByModel,
        context: params.context
      });
      if (result.status === "complete" && canUsePrivateCouncilCache(params.input.saveHistory)) {
        critiqueCache.set(cacheKey, result);
      }
      return result;
    })
  );
}

export async function runRevisionStage(params: {
  admin: CouncilAdminClient;
  input: CouncilRunInput;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  context: CouncilRunContext;
  runId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
}): Promise<StageResult[]> {
  await emit(params.context, { type: "stage", stage: "revision", message: "Asking models to revise their answers." });

  return Promise.all(
    params.input.models.map(async (modelId) => {
      const messages = buildRevisionMessages({
        modelId,
        prompt: params.input.prompt,
        researchContext: params.researchContext,
        attachmentContext: params.attachmentContext,
        initialResponses: params.initialResponses,
        critiqueRounds: params.critiqueRounds
      });
      const generation = COUNCIL_GENERATION_BY_STAGE.revision;
      const cacheKey = createCouncilCacheKey({
        userId: params.context.userId,
        stage: "revision",
        modelId,
        messages,
        generation
      });
      const cached = canUsePrivateCouncilCache(params.input.saveHistory) ? revisionCache.get(cacheKey) : undefined;
      if (cached) {
        return reuseCachedResult({
          cached,
          admin: params.admin,
          runId: params.runId,
          userId: params.context.userId,
          stage: "revision",
          modelId,
          message: `Using cached revision for ${modelId}.`,
          usageEvents: params.usageEvents,
          context: params.context,
          persistResult: (result) => persistModelResponse(params.admin, params.runId, params.input.saveHistory, result),
          emitResult: (result) => emit(params.context, { type: "model_response", response: result })
        });
      }

      const result = await callModelStage({
        admin: params.admin,
        modelId,
        stage: "revision",
        messages,
        generation,
        saveHistory: params.input.saveHistory,
        runId: params.runId,
        userId: params.context.userId,
        usageEvents: params.usageEvents,
        pricingByModel: params.pricingByModel,
        context: params.context
      });
      if (result.status === "complete" && canUsePrivateCouncilCache(params.input.saveHistory)) {
        revisionCache.set(cacheKey, result);
      }
      return result;
    })
  );
}
