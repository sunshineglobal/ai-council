import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { runCouncil } from "@/lib/council";
import { completeWithOpenRouter } from "@/lib/openrouter";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { evalRunSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const profile = await requireApiProfile();
    const body = evalRunSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();

    const { data: evalSet, error: evalSetError } = await admin
      .from("eval_sets")
      .insert({
        user_id: profile.id,
        name: body.name,
        description: body.description ?? null,
        rubric: body.rubric,
        items: body.items
      })
      .select("id")
      .single();
    if (evalSetError) throw evalSetError;

    const { data: evalRun, error: evalRunError } = await admin
      .from("eval_runs")
      .insert({
        eval_set_id: evalSet.id,
        user_id: profile.id,
        baseline_label: body.baselineLabel ?? null,
        council_config: {
          models: body.models,
          judgeModel: body.judgeModel,
          debateDepth: body.debateDepth,
          researchEnabled: body.researchEnabled
        },
        status: "running"
      })
      .select("id")
      .single();
    if (evalRunError) throw evalRunError;

    const scores: number[] = [];

    for (const [index, item] of body.items.entries()) {
      const council = await runCouncil(
        {
          prompt: item.prompt,
          models: body.models,
          judgeModel: body.judgeModel,
          debateDepth: body.debateDepth,
          researchEnabled: body.researchEnabled,
          saveHistory: false
        },
        { userId: profile.id, userEmail: profile.email }
      );

      const score = await scoreAnswer({
        judgeModel: body.judgeModel,
        prompt: item.prompt,
        rubric: body.rubric,
        answer: council.finalAnswer
      });
      scores.push(score.score);

      await admin.from("eval_scores").insert({
        eval_run_id: evalRun.id,
        item_index: index,
        prompt: item.prompt,
        score: score.score,
        rationale: score.rationale,
        final_answer: council.finalAnswer,
        judge_model: body.judgeModel
      });
    }

    const aggregate = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    await admin
      .from("eval_runs")
      .update({
        status: "complete",
        aggregate_score: aggregate,
        completed_at: new Date().toISOString()
      })
      .eq("id", evalRun.id);

    return NextResponse.json({ evalRunId: evalRun.id, aggregateScore: aggregate });
  } catch (error) {
    return jsonError(error);
  }
}

async function scoreAnswer(params: { judgeModel: string; prompt: string; rubric: string; answer: string }) {
  const completion = await completeWithOpenRouter({
    model: params.judgeModel,
    responseFormat: "json_object",
    temperature: 0,
    maxTokens: 600,
    messages: [
      {
        role: "system",
        content: "Score the answer from 0 to 100 against the rubric. Return JSON only."
      },
      {
        role: "user",
        content: `Prompt:\n${params.prompt}\n\nRubric:\n${params.rubric}\n\nAnswer:\n${params.answer}\n\nReturn {"score": number, "rationale": "short explanation"}.`
      }
    ]
  });

  try {
    const parsed = JSON.parse(completion.content) as { score?: number; rationale?: string };
    return {
      score: Math.max(0, Math.min(100, parsed.score ?? 0)),
      rationale: parsed.rationale ?? completion.content
    };
  } catch {
    return { score: 0, rationale: completion.content };
  }
}
