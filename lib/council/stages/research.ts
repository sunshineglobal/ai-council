import { isCouncilAbortError } from "@/lib/council/abort";
import { emitCouncilEvent as emit, type CouncilRunContext } from "@/lib/council/context";
import { persistResearchResult, type CouncilAdminClient } from "@/lib/council/persistence";
import { recordCouncilUsage } from "@/lib/council/usage";
import { getErrorLog } from "@/lib/errors";
import { DEFAULT_FIRECRAWL_LIMIT, searchWithFirecrawl } from "@/lib/firecrawl";
import { emptyUsage } from "@/lib/token-usage";
import { buildUsageEvent } from "@/lib/usage";
import type { ResearchResult, UsageEvent } from "@/lib/types";

export async function runResearchStage(
  admin: CouncilAdminClient,
  prompt: string,
  saveHistory: boolean,
  runId: string,
  context: CouncilRunContext,
  usageEvents: UsageEvent[]
): Promise<ResearchResult | undefined> {
  await emit(context, {
    type: "stage",
    stage: "research_context",
    message: `Searching the web with Firecrawl for at least ${DEFAULT_FIRECRAWL_LIMIT} detailed sources.`
  });

  let research: ResearchResult;
  try {
    research = await searchWithFirecrawl(prompt, DEFAULT_FIRECRAWL_LIMIT, context.signal, context.userId);
  } catch (error) {
    if (isCouncilAbortError(error, context.signal)) throw error;
    console.warn("[council] Firecrawl research failed before model answers", {
      runId,
      userId: context.userId,
      ...getErrorLog(error)
    });
    const usage = buildUsageEvent({
      stage: "research_context",
      modelId: "firecrawl",
      usage: { ...emptyUsage(), estimated: true },
      latencyMs: 0,
      status: "error"
    });
    await recordCouncilUsage({
      admin,
      runId,
      userId: context.userId,
      usage,
      usageEvents,
      emit: (event) => emit(context, event)
    });
    await emit(context, {
      type: "stage",
      stage: "research_context",
      message: "Firecrawl research failed before council answers."
    });
    throw error;
  }

  if (!hasMinimumDetailedSources(research)) {
    const message = `Firecrawl returned ${research.sources.length} detailed sources; at least ${DEFAULT_FIRECRAWL_LIMIT} are required before council answers.`;
    console.warn("[council] Firecrawl returned too few detailed sources", {
      runId,
      userId: context.userId,
      sourceCount: research.sources.length,
      requiredSourceCount: DEFAULT_FIRECRAWL_LIMIT
    });
    const usage = buildUsageEvent({
      stage: "research_context",
      modelId: "firecrawl",
      usage: {
        promptTokens: research.estimatedContextTokens,
        completionTokens: 0,
        totalTokens: research.estimatedContextTokens,
        estimated: true
      },
      latencyMs: 0,
      status: "error"
    });
    await recordCouncilUsage({
      admin,
      runId,
      userId: context.userId,
      usage,
      usageEvents,
      emit: (event) => emit(context, event)
    });
    await emit(context, { type: "stage", stage: "research_context", message });
    await emit(context, { type: "research", research });
    throw new Error(message);
  }

  const usage = buildUsageEvent({
    stage: "research_context",
    modelId: "firecrawl",
    usage: {
      promptTokens: research.estimatedContextTokens,
      completionTokens: 0,
      totalTokens: research.estimatedContextTokens,
      estimated: true
    },
    latencyMs: 0,
    status: "estimated"
  });
  await recordCouncilUsage({
    admin,
    runId,
    userId: context.userId,
    usage,
    usageEvents,
    emit: (event) => emit(context, event)
  });
  await persistResearchResult(admin, runId, context.userId, saveHistory, research);

  await emit(context, { type: "research", research });
  return research;
}

function hasMinimumDetailedSources(research: ResearchResult): boolean {
  return research.sources.length >= DEFAULT_FIRECRAWL_LIMIT;
}
