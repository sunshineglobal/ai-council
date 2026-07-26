import type { CompletionResult } from "@/lib/openrouter";
import { loadModelPricing } from "@/lib/model-pricing";
import { emptyUsage } from "@/lib/token-usage";
import { buildUsageEvent, type ModelPricingMap } from "@/lib/usage";
import type { CouncilEvent, CouncilStage, UsageEvent } from "@/lib/types";
import { persistCouncilUsage, type CouncilAdminClient } from "@/lib/council/persistence";
import { releaseCompletionBudget } from "@/lib/production-guardrails";

type EmitCouncilEvent = (event: CouncilEvent) => Promise<void>;

export async function loadCouncilPricing() {
  return loadModelPricing({ required: true });
}

export async function recordCompletionUsage(params: {
  admin: CouncilAdminClient;
  runId: string;
  userId: string;
  stage: CouncilStage;
  modelId: string;
  completion: CompletionResult;
  pricingByModel: ModelPricingMap;
  usageEvents: UsageEvent[];
  emit: EmitCouncilEvent;
}): Promise<UsageEvent> {
  const usage = await recordCouncilUsage({
    admin: params.admin,
    runId: params.runId,
    userId: params.userId,
    usage: buildUsageEvent({
      stage: params.stage,
      modelId: params.modelId,
      usage: params.completion.usage,
      latencyMs: params.completion.latencyMs,
      pricing: params.pricingByModel[params.modelId]
    }),
    usageEvents: params.usageEvents,
    emit: params.emit
  });
  await releaseCompletionBudget(params.userId, params.completion.budgetReservationId);
  return usage;
}

export async function recordCachedUsage(params: {
  admin: CouncilAdminClient;
  runId: string;
  userId: string;
  stage: CouncilStage;
  modelId: string;
  usageEvents: UsageEvent[];
  emit: EmitCouncilEvent;
}): Promise<UsageEvent> {
  return recordCouncilUsage({
    admin: params.admin,
    runId: params.runId,
    userId: params.userId,
    usage: buildUsageEvent({
      stage: params.stage,
      modelId: params.modelId,
      usage: { ...emptyUsage(), estimated: true },
      latencyMs: 0,
      status: "estimated"
    }),
    usageEvents: params.usageEvents,
    emit: params.emit
  });
}

export async function recordCouncilUsage(params: {
  admin: CouncilAdminClient;
  runId: string;
  userId: string;
  usage: UsageEvent;
  usageEvents: UsageEvent[];
  emit: EmitCouncilEvent;
}): Promise<UsageEvent> {
  params.usageEvents.push(params.usage);
  await persistCouncilUsage(params.admin, {
    runId: params.runId,
    userId: params.userId,
    usage: params.usage
  });
  await params.emit({ type: "usage", usage: params.usage });
  return params.usage;
}
