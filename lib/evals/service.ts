import { runCouncil } from "@/lib/council";
import { getErrorLog } from "@/lib/errors";
import {
  createEvalRunRecords,
  markEvalRunComplete,
  markEvalRunFailed,
  persistEvalScore
} from "@/lib/evals/repository";
import { scoreEvalAnswer } from "@/lib/evals/scoring";
import type { EvalRunInput, EvalRunResult } from "@/lib/evals/types";
import { loadModelPricing } from "@/lib/model-pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AuthProfile } from "@/lib/types";
import { buildUsageEvent, persistUsageEvent } from "@/lib/usage";

export async function runEval(params: {
  profile: Pick<AuthProfile, "id" | "email">;
  input: EvalRunInput;
  signal?: AbortSignal;
}): Promise<EvalRunResult> {
  const admin = createSupabaseAdminClient();
  let evalRunId: string | undefined;

  try {
    const pricingByModel = await loadModelPricing();
    evalRunId = await createEvalRunRecords({
      admin,
      userId: params.profile.id,
      input: params.input
    });

    const scores: number[] = [];
    for (const [index, item] of params.input.items.entries()) {
      const council = await runCouncil(
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

      const score = await scoreEvalAnswer({
        judgeModel: params.input.judgeModel,
        prompt: item.prompt,
        rubric: params.input.rubric,
        answer: council.finalAnswer,
        signal: params.signal
      });
      scores.push(score.score);

      await persistUsageEvent({
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

      await persistEvalScore({
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
    await markEvalRunComplete({ admin, evalRunId, aggregateScore });

    return { evalRunId, aggregateScore };
  } catch (error) {
    if (evalRunId) {
      const failedUpdateError = await markEvalRunFailed(admin, evalRunId);
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
