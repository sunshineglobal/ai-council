import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { EvalRunInput } from "@/lib/evals/types";

export type EvalAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function createEvalRunRecords(params: {
  admin: EvalAdminClient;
  userId: string;
  input: EvalRunInput;
}): Promise<string> {
  const { data: evalSet, error: evalSetError } = await params.admin
    .from("eval_sets")
    .insert({
      user_id: params.userId,
      name: params.input.name,
      description: params.input.description ?? null,
      rubric: params.input.rubric,
      items: params.input.items
    })
    .select("id")
    .single();
  if (evalSetError) throw evalSetError;

  const { data: evalRun, error: evalRunError } = await params.admin
    .from("eval_runs")
    .insert({
      eval_set_id: evalSet.id,
      user_id: params.userId,
      baseline_label: params.input.baselineLabel ?? null,
      council_config: {
        models: params.input.models,
        judgeModel: params.input.judgeModel,
        debateDepth: params.input.debateDepth,
        researchEnabled: params.input.researchEnabled
      },
      status: "running"
    })
    .select("id")
    .single();
  if (evalRunError) throw evalRunError;
  return evalRun.id as string;
}

export async function persistEvalScore(params: {
  admin: EvalAdminClient;
  evalRunId: string;
  itemIndex: number;
  prompt: string;
  score: number;
  rationale: string;
  finalAnswer: string;
  judgeModel: string;
}): Promise<void> {
  const { error } = await params.admin.from("eval_scores").insert({
    eval_run_id: params.evalRunId,
    item_index: params.itemIndex,
    prompt: params.prompt,
    score: params.score,
    rationale: params.rationale,
    final_answer: params.finalAnswer,
    judge_model: params.judgeModel
  });
  if (error) throw error;
}

export async function markEvalRunComplete(params: {
  admin: EvalAdminClient;
  evalRunId: string;
  aggregateScore: number;
}): Promise<void> {
  const { error } = await params.admin
    .from("eval_runs")
    .update({
      status: "complete",
      aggregate_score: params.aggregateScore,
      completed_at: new Date().toISOString()
    })
    .eq("id", params.evalRunId);
  if (error) throw error;
}

export async function markEvalRunFailed(admin: EvalAdminClient, evalRunId: string): Promise<unknown> {
  const { error } = await admin
    .from("eval_runs")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("id", evalRunId);
  return error;
}

export async function listEvalRunsForUser(userId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("eval_runs")
    .select("id,status,aggregate_score,created_at,baseline_label,council_config,eval_sets(name,rubric,description),eval_scores(score,prompt,rationale,final_answer)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
