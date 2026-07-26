import { runCouncil } from "@/lib/council";
import { getErrorLog } from "@/lib/errors";
import {
  createEvalRunRecords,
  markEvalRunComplete,
  markEvalRunFailed,
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
  input: EvalRunInput;
  signal?: AbortSignal;
};

export type EvalServiceDependencies = {
  createAdminClient: () => EvalAdminClient;
  loadPricing: typeof loadModelPricing;
  createRunRecords: typeof createEvalRunRecords;
  runCouncil: (
    input: CouncilRunInput,
    context: CouncilRunContext
  ) => Promise<Pick<CouncilRunResult, "finalAnswer">>;
  scoreAnswer: typeof scoreEvalAnswer;
  persistUsage: typeof persistUsageEvent;
  persistScore: typeof persistEvalScore;
  markComplete: typeof markEvalRunComplete;
  markFailed: typeof markEvalRunFailed;
};

const defaultDependencies: EvalServiceDependencies = {
  createAdminClient: createSupabaseAdminClient,
  loadPricing: loadModelPricing,
  createRunRecords: createEvalRunRecords,
  runCouncil,
  scoreAnswer: scoreEvalAnswer,
  persistUsage: persistUsageEvent,
  persistScore: persistEvalScore,
  markComplete: markEvalRunComplete,
  markFailed: markEvalRunFailed
};

export async function runEval(
  params: RunEvalParams,
  dependencies: EvalServiceDependencies = defaultDependencies
): Promise<EvalRunResult> {
  const admin = dependencies.createAdminClient();
  let evalRunId: string | undefined;

  try {
    const pricingByModel = await dependencies.loadPricing({ required: true });
    assertModelPricingAvailable(
      [...params.input.models, params.input.judgeModel],
      pricingByModel
    );
    evalRunId = await dependencies.createRunRecords({
      admin,
      userId: params.profile.id,
      input: params.input
    });

    const scores: number[] = [];
    for (const [index, item] of params.input.items.entries()) {
      const council = await dependencies.runCouncil(
        {
          prompt: item.prompt,
          models: params.input.models,
          judgeModel: params.input.judgeModel,
          debateDepth: params.input.debateDepth,
          researchEnabled: params.input.researchEnabled,
          saveHistory: false
        },
        {
          userId: params.profile.id,
          userEmail: params.profile.email,
          signal: params.signal
        }
      );

      const score = await dependencies.scoreAnswer({
        judgeModel: params.input.judgeModel,
        prompt: item.prompt,
        rubric: params.input.rubric,
        answer: council.finalAnswer,
        signal: params.signal,
        userId: params.profile.id,
        pricing: pricingByModel[params.input.judgeModel]
      });
      scores.push(score.score);

      await dependencies.persistUsage({
        userId: params.profile.id,
        usage: buildUsageEvent({
          stage: "eval_scoring",
          modelId: params.input.judgeModel,
          usage: score.completion.usage,
          latencyMs: score.completion.latencyMs,
          pricing: pricingByModel[params.input.judgeModel]
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
        judgeModel: params.input.judgeModel
      });
    }

    const aggregateScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    await dependencies.markComplete({ admin, evalRunId, aggregateScore });

    return { evalRunId, aggregateScore };
  } catch (error) {
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
