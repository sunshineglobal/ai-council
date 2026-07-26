import { isCouncilAbortError } from "@/lib/council/abort";
import { canUsePrivateCouncilCache, createCouncilCacheKey, judgeCache } from "@/lib/council/cache";
import { emitCouncilEvent as emit, type CouncilRunContext } from "@/lib/council/context";
import { COUNCIL_GENERATION_BY_STAGE, withoutResponseFormat } from "@/lib/council/generation";
import { parseJudgeOutput } from "@/lib/council/judge-output";
import { persistJudge, type CouncilAdminClient } from "@/lib/council/persistence";
import { buildJudgeMessages } from "@/lib/council/prompts";
import { reuseCachedResult } from "@/lib/council/stages/shared";
import { recordCompletionUsage } from "@/lib/council/usage";
import { getErrorLog } from "@/lib/errors";
import { buildResearchContext } from "@/lib/firecrawl";
import { completeWithOpenRouter, type CompletionResult } from "@/lib/openrouter";
import { emptyUsage } from "@/lib/token-usage";
import type { ModelPricingMap } from "@/lib/usage";
import type {
  CouncilRunInput,
  CritiqueResult,
  JudgeResult,
  ResearchResult,
  StageResult,
  UsageEvent
} from "@/lib/types";

type RunJudgeStageParams = {
  admin: CouncilAdminClient;
  input: CouncilRunInput;
  research?: ResearchResult;
  attachmentContext: string;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  revisions: StageResult[];
  context: CouncilRunContext;
  runId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
};

export async function runJudgeStage(params: RunJudgeStageParams): Promise<JudgeResult> {
  await emit(params.context, {
    type: "stage",
    stage: "judge_synthesis",
    modelId: params.input.judgeModel,
    message: "Ranking the council and writing the final answer."
  });

  const id = crypto.randomUUID();
  const messages = buildJudgeMessages({
    prompt: params.input.prompt,
    researchContext: params.research ? buildResearchContext(params.research) : "",
    attachmentContext: params.attachmentContext,
    initialResponses: params.initialResponses,
    critiqueRounds: params.critiqueRounds,
    revisions: params.revisions
  });
  const generation = COUNCIL_GENERATION_BY_STAGE.judge_synthesis;
  const cacheKey = createCouncilCacheKey({
    userId: params.context.userId,
    stage: "judge_synthesis",
    modelId: params.input.judgeModel,
    messages,
    generation
  });
  const cached = canUsePrivateCouncilCache(params.input.saveHistory) ? judgeCache.get(cacheKey) : undefined;
  if (cached) {
    return reuseCachedResult({
      cached,
      resultId: id,
      admin: params.admin,
      runId: params.runId,
      userId: params.context.userId,
      stage: "judge_synthesis",
      modelId: params.input.judgeModel,
      message: `Using cached judge synthesis for ${params.input.judgeModel}.`,
      includeModelIdInStageEvent: true,
      usageEvents: params.usageEvents,
      context: params.context,
      persistResult: (result) => persistJudge(params.admin, params.runId, params.input.saveHistory, result),
      emitResult: (result) => emit(params.context, { type: "judge", judge: result })
    });
  }

  let completion: CompletionResult;
  try {
    try {
      completion = await completeWithOpenRouter({
        model: params.input.judgeModel,
        messages,
        ...generation,
        cacheControl: true,
        signal: params.context.signal,
        budget: {
          userId: params.context.userId,
          pricing: params.pricingByModel[params.input.judgeModel]
        }
      });
    } catch (error) {
      if (isCouncilAbortError(error, params.context.signal)) throw error;
      console.warn("[council] judge JSON mode failed, retrying without response_format", {
        runId: params.runId,
        modelId: params.input.judgeModel,
        ...getErrorLog(error)
      });
      completion = await completeWithOpenRouter({
        model: params.input.judgeModel,
        messages,
        ...withoutResponseFormat(generation),
        cacheControl: true,
        signal: params.context.signal,
        budget: {
          userId: params.context.userId,
          pricing: params.pricingByModel[params.input.judgeModel]
        }
      });
    }
  } catch (error) {
    if (isCouncilAbortError(error, params.context.signal)) throw error;
    console.warn("[council] judge request failed", {
      runId: params.runId,
      modelId: params.input.judgeModel,
      ...getErrorLog(error)
    });
    return persistFailedJudgeResult(
      params,
      {
        id,
        modelId: params.input.judgeModel,
        synthesis: "The judge model failed before it could synthesize a final answer.",
        rankings: [],
        usage: emptyUsage(),
        latencyMs: 0,
        status: "error",
        error: "Judge request failed."
      }
    );
  }

  let parsed: ReturnType<typeof parseJudgeOutput>;
  try {
    parsed = parseJudgeOutput(completion.content, params.input.models);
  } catch (error) {
    console.warn("[council] judge returned an invalid result", {
      runId: params.runId,
      modelId: params.input.judgeModel,
      ...getErrorLog(error)
    });
    return persistFailedJudgeResult(
      params,
      {
        id,
        modelId: params.input.judgeModel,
        synthesis: "The judge model returned an invalid result.",
        rankings: [],
        usage: completion.usage,
        latencyMs: completion.latencyMs,
        status: "error",
        error: "Judge returned an invalid result."
      },
      completion
    );
  }

  const result: JudgeResult = {
    id,
    modelId: params.input.judgeModel,
    synthesis: parsed.synthesis,
    rankings: parsed.rankings,
    usage: completion.usage,
    latencyMs: completion.latencyMs,
    status: "complete"
  };

  await persistJudge(params.admin, params.runId, params.input.saveHistory, result);
  if (canUsePrivateCouncilCache(params.input.saveHistory)) judgeCache.set(cacheKey, result);
  await recordCompletionUsage({
    admin: params.admin,
    runId: params.runId,
    userId: params.context.userId,
    stage: "judge_synthesis",
    modelId: params.input.judgeModel,
    completion,
    pricingByModel: params.pricingByModel,
    usageEvents: params.usageEvents,
    emit: (event) => emit(params.context, event)
  });
  await emit(params.context, { type: "judge", judge: result });

  return result;
}

async function persistFailedJudgeResult(
  params: RunJudgeStageParams,
  result: JudgeResult,
  completion?: CompletionResult
): Promise<JudgeResult> {
  await persistJudge(params.admin, params.runId, params.input.saveHistory, result);
  if (completion) {
    await recordCompletionUsage({
      admin: params.admin,
      runId: params.runId,
      userId: params.context.userId,
      stage: "judge_synthesis",
      modelId: params.input.judgeModel,
      completion,
      pricingByModel: params.pricingByModel,
      usageEvents: params.usageEvents,
      emit: (event) => emit(params.context, event)
    });
  }
  await emit(params.context, { type: "judge", judge: result });
  return result;
}
