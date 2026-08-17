import { isCouncilAbortError } from "@/lib/council/abort";
import { runCouncil } from "@/lib/council";
import { getErrorLog } from "@/lib/errors";
import type { EvalAbortReason, EvalEvent } from "@/lib/evals/events";
import {
  createEvalRunRecords,
  loadEvalRunForResume,
  markEvalRunComplete,
  markEvalRunFailed,
  markEvalRunPartial,
  markEvalRunRunning,
  persistEvalScore
} from "@/lib/evals/repository";
import { scoreEvalAnswer } from "@/lib/evals/scoring";
import type { EvalAdminClient } from "@/lib/evals/repository";
import type { EvalRunInput, EvalRunResult } from "@/lib/evals/types";
import { loadModelPricing } from "@/lib/model-pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AuthProfile, CouncilRunInput, CouncilRunResult } from "@/lib/types";
import type { CouncilRunContext } from "@/lib/council/context";
import { buildUsageEvent, persistUsageEvent } from "@/lib/usage";
import {
  assertModelPricingAvailable,
  releaseCompletionBudget
} from "@/lib/production-guardrails";

export type RunEvalParams = {
  profile: Pick<AuthProfile, "id" | "email">;
  input?: EvalRunInput;
  resumeEvalRunId?: string;
  signal?: AbortSignal;
  abortReason?: () => EvalAbortReason;
  onEvent?: (event: EvalEvent) => void | Promise<void>;
};

export type EvalServiceDependencies = {
  createAdminClient: () => EvalAdminClient;
  loadPricing: typeof loadModelPricing;
  createRunRecords: typeof createEvalRunRecords;
  loadResume: typeof loadEvalRunForResume;
  runCouncil: (
    input: CouncilRunInput,
    context: CouncilRunContext
  ) => Promise<Pick<CouncilRunResult, "finalAnswer">>;
  scoreAnswer: typeof scoreEvalAnswer;
  persistUsage: typeof persistUsageEvent;
  persistScore: typeof persistEvalScore;
  markComplete: typeof markEvalRunComplete;
  markPartial: typeof markEvalRunPartial;
  markRunning: typeof markEvalRunRunning;
  markFailed: typeof markEvalRunFailed;
};

const defaultDependencies: EvalServiceDependencies = {
  createAdminClient: createSupabaseAdminClient,
  loadPricing: loadModelPricing,
  createRunRecords: createEvalRunRecords,
  loadResume: loadEvalRunForResume,
  runCouncil,
  scoreAnswer: scoreEvalAnswer,
  persistUsage: persistUsageEvent,
  persistScore: persistEvalScore,
  markComplete: markEvalRunComplete,
  markPartial: markEvalRunPartial,
  markRunning: markEvalRunRunning,
  markFailed: markEvalRunFailed
};

export async function runEval(
  params: RunEvalParams,
  dependencies: EvalServiceDependencies = defaultDependencies
): Promise<EvalRunResult> {
  const admin = dependencies.createAdminClient();
  let evalRunId: string | undefined;
  const scores: number[] = [];
  let input = params.input;
  const completedIndexes = new Set<number>();

  try {
    if (params.resumeEvalRunId) {
      const resume = await dependencies.loadResume({
        admin,
        userId: params.profile.id,
        evalRunId: params.resumeEvalRunId
      });
      evalRunId = resume.evalRunId;
      input = resume.input;
      for (const [index, score] of resume.scores.entries()) {
        const itemIndex = resume.completedIndexes[index];
        if (itemIndex === undefined) continue;
        completedIndexes.add(itemIndex);
        scores[itemIndex] = score;
      }
    } else if (!input) {
      throw new Error("Eval input is required.");
    }

    if (!input) throw new Error("Eval input is required.");

    const pricingByModel = await dependencies.loadPricing({ required: true });
    assertModelPricingAvailable(
      [...input.models, input.judgeModel],
      pricingByModel
    );

    if (params.resumeEvalRunId && evalRunId) {
      await dependencies.markRunning({ admin, evalRunId });
    } else if (input) {
      evalRunId = await dependencies.createRunRecords({
        admin,
        userId: params.profile.id,
        input
      });
    }

    if (!input || !evalRunId) throw new Error("Eval input is required.");

    await emit(params, {
      type: "started",
      evalRunId,
      total: input.items.length,
      completed: completedIndexes.size
    });

    for (const [index, item] of input.items.entries()) {
      if (completedIndexes.has(index)) continue;

      await emit(params, {
        type: "item_started",
        evalRunId,
        itemIndex: index,
        total: input.items.length,
        prompt: item.prompt
      });

      const council = await dependencies.runCouncil(
        {
          prompt: item.prompt,
          models: input.models,
          judgeModel: input.judgeModel,
          debateDepth: input.debateDepth,
          researchEnabled: input.researchEnabled,
          saveHistory: false
        },
        {
          userId: params.profile.id,
          userEmail: params.profile.email,
          signal: params.signal
        }
      );

      const score = await dependencies.scoreAnswer({
        judgeModel: input.judgeModel,
        prompt: item.prompt,
        rubric: input.rubric,
        answer: council.finalAnswer,
        signal: params.signal,
        userId: params.profile.id,
        pricing: pricingByModel[input.judgeModel]
      });
      scores[index] = score.score;
      completedIndexes.add(index);

      await dependencies.persistUsage({
        userId: params.profile.id,
        usage: buildUsageEvent({
          stage: "eval_scoring",
          modelId: input.judgeModel,
          usage: score.completion.usage,
          latencyMs: score.completion.latencyMs,
          pricing: pricingByModel[input.judgeModel]
        }),
        metadata: {
          evalRunId,
          itemIndex: index
        }
      });
      await releaseCompletionBudget(params.profile.id, score.completion.budgetReservationId);

      await dependencies.persistScore({
        admin,
        evalRunId,
        itemIndex: index,
        prompt: item.prompt,
        score: score.score,
        rationale: score.rationale,
        finalAnswer: council.finalAnswer,
        judgeModel: input.judgeModel
      });

      await emit(params, {
        type: "item_scored",
        evalRunId,
        itemIndex: index,
        total: input.items.length,
        prompt: item.prompt,
        score: score.score,
        rationale: score.rationale,
        finalAnswer: council.finalAnswer
      });
    }

    const completedScores = completedScoreValues(scores);
    const aggregateScore = averageScore(completedScores);
    await dependencies.markComplete({ admin, evalRunId, aggregateScore });
    await emit(params, {
      type: "complete",
      evalRunId,
      aggregateScore,
      scored: completedScores.length,
      total: input.items.length
    });

    return {
      evalRunId,
      aggregateScore,
      status: "complete",
      scored: completedScores.length,
      total: input.items.length
    };
  } catch (error) {
    const completedScores = completedScoreValues(scores);
    if (evalRunId && input && isCouncilAbortError(error, params.signal) && completedScores.length > 0) {
      const aggregateScore = averageScore(completedScores);
      const reason = params.abortReason?.() ?? "cancelled";
      await dependencies.markPartial({ admin, evalRunId, aggregateScore });
      await emit(params, {
        type: "partial",
        evalRunId,
        aggregateScore,
        scored: completedScores.length,
        total: input.items.length,
        reason
      });
      return {
        evalRunId,
        aggregateScore,
        status: "partial",
        scored: completedScores.length,
        total: input.items.length,
        reason
      };
    }

    if (evalRunId) {
      const failedUpdateError = await dependencies.markFailed(admin, evalRunId);
      if (failedUpdateError) {
        console.error("[evals] could not mark eval run failed", {
          evalRunId,
          ...getErrorLog(failedUpdateError)
        });
      }
    }
    throw error;
  }
}

async function emit(params: RunEvalParams, event: EvalEvent): Promise<void> {
  await params.onEvent?.(event);
}

function completedScoreValues(scores: Array<number | undefined>): number[] {
  return scores.filter((score): score is number => typeof score === "number" && Number.isFinite(score));
}

function averageScore(scores: number[]): number {
  if (!scores.length) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
