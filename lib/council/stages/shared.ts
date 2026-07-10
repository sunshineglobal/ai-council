import { emitCouncilEvent as emit, type CouncilRunContext } from "@/lib/council/context";
import type { CouncilAdminClient } from "@/lib/council/persistence";
import { recordCachedUsage } from "@/lib/council/usage";
import { emptyUsage } from "@/lib/token-usage";
import type {
  CouncilStage,
  CritiqueResult,
  JudgeResult,
  StageResult,
  UsageEvent
} from "@/lib/types";

type CachedCouncilResult = StageResult | CritiqueResult | JudgeResult;

export async function reuseCachedResult<Result extends CachedCouncilResult>(params: {
  cached: Result;
  resultId?: string;
  admin: CouncilAdminClient;
  runId: string;
  userId: string;
  stage: CouncilStage;
  modelId: string;
  message: string;
  includeModelIdInStageEvent?: boolean;
  usageEvents: UsageEvent[];
  context: CouncilRunContext;
  persistResult: (result: Result) => Promise<void>;
  emitResult: (result: Result) => Promise<void>;
}): Promise<Result> {
  await emit(params.context, {
    type: "stage",
    stage: params.stage,
    ...(params.includeModelIdInStageEvent ? { modelId: params.modelId } : {}),
    message: params.message
  });
  await recordCachedUsage({
    admin: params.admin,
    runId: params.runId,
    userId: params.userId,
    stage: params.stage,
    modelId: params.modelId,
    usageEvents: params.usageEvents,
    emit: (event) => emit(params.context, event)
  });

  const result: Result = {
    ...params.cached,
    id: params.resultId ?? crypto.randomUUID(),
    usage: emptyUsage(),
    latencyMs: 0
  };
  await params.persistResult(result);
  await params.emitResult(result);
  return result;
}
