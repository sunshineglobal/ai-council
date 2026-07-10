import { getErrorMessage } from "@/lib/errors";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  CouncilRunInput,
  CritiqueResult,
  JudgeResult,
  ResearchResult,
  StageResult,
  TokenTotals,
  UsageEvent
} from "@/lib/types";

export type CouncilAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function verifyOwnedThread(admin: CouncilAdminClient, threadId: string, userId: string): Promise<void> {
  const { data, error } = await admin
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  assertSupabaseOk("checking chat thread ownership", error);
  if (!data) throw new Error("Chat thread not found.");
}

export async function createCouncilThread(
  admin: CouncilAdminClient,
  params: { userId: string; title: string }
): Promise<string> {
  const { data, error } = await admin
    .from("chat_threads")
    .insert({ user_id: params.userId, title: params.title, is_ephemeral: false })
    .select("id")
    .single();
  assertSupabaseOk("creating chat thread", error);
  if (!data?.id) throw new Error("Supabase data write failed while creating chat thread: no id was returned.");
  return data.id as string;
}

export async function deleteThreadIfOrphaned(
  admin: CouncilAdminClient,
  params: { threadId: string; userId: string }
): Promise<boolean> {
  const { data: runs, error: runsError } = await admin
    .from("council_runs")
    .select("id")
    .eq("thread_id", params.threadId)
    .limit(1);
  assertSupabaseOk("checking a new chat thread for runs", runsError);
  if ((runs ?? []).length > 0) return false;

  const { error: deleteError } = await admin
    .from("chat_threads")
    .delete()
    .eq("id", params.threadId)
    .eq("user_id", params.userId);
  assertSupabaseOk("cleaning up an orphaned chat thread", deleteError);
  return true;
}

export async function insertCouncilRun(
  admin: CouncilAdminClient,
  params: { id: string; threadId?: string; userId: string; input: CouncilRunInput }
): Promise<void> {
  const { error } = await admin.from("council_runs").insert({
    id: params.id,
    thread_id: params.threadId ?? null,
    user_id: params.userId,
    prompt_text: params.input.saveHistory ? params.input.prompt : null,
    final_answer: null,
    judge_model: params.input.judgeModel,
    models: params.input.models,
    debate_depth: params.input.debateDepth,
    research_enabled: params.input.researchEnabled,
    saved_mode: params.input.saveHistory,
    status: "running"
  });
  assertSupabaseOk("creating council run", error);
}

export async function markCouncilRunComplete(
  admin: CouncilAdminClient,
  params: {
    runId: string;
    userId: string;
    finalAnswer: string | null;
    tokenTotals: TokenTotals;
    costEstimate: number;
    latencyMs: number;
  }
): Promise<void> {
  const { error } = await admin
    .from("council_runs")
    .update({
      final_answer: params.finalAnswer,
      status: "complete",
      token_totals: params.tokenTotals,
      cost_estimate: params.costEstimate,
      latency_ms: params.latencyMs,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.runId)
    .eq("user_id", params.userId);
  assertSupabaseOk("marking council run complete", error);
}

export async function markCouncilRunFailed(
  admin: CouncilAdminClient,
  params: { runId: string; userId: string; latencyMs: number }
): Promise<void> {
  const { error } = await admin
    .from("council_runs")
    .update({ status: "failed", latency_ms: params.latencyMs, updated_at: new Date().toISOString() })
    .eq("id", params.runId)
    .eq("user_id", params.userId);
  assertSupabaseOk("marking council run failed", error);
}

export async function touchCouncilThread(
  admin: CouncilAdminClient,
  params: { threadId: string; userId: string }
): Promise<void> {
  const { error } = await admin
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.threadId)
    .eq("user_id", params.userId);
  assertSupabaseOk("updating chat thread timestamp", error);
}

export async function persistModelResponse(
  admin: CouncilAdminClient,
  runId: string,
  saveHistory: boolean,
  result: StageResult
): Promise<void> {
  const { error } = await admin.from("model_responses").insert({
    id: result.id,
    run_id: runId,
    model_id: result.modelId,
    stage: result.stage,
    content: saveHistory ? result.content : null,
    token_usage: result.usage,
    latency_ms: result.latencyMs,
    status: result.status,
    error: result.error ?? null
  });
  assertSupabaseOk("saving model response", error);
}

export async function persistResearchResult(
  admin: CouncilAdminClient,
  runId: string,
  userId: string,
  saveHistory: boolean,
  research: ResearchResult
): Promise<void> {
  const { error } = await admin.from("research_results").insert({
    run_id: runId,
    user_id: userId,
    query: saveHistory ? research.query : null,
    results: saveHistory ? research.sources : null,
    result_count: research.sources.length,
    firecrawl_credits: research.credits,
    saved_mode: saveHistory
  });
  assertSupabaseOk("saving research results", error);
}

export async function persistCritique(
  admin: CouncilAdminClient,
  runId: string,
  saveHistory: boolean,
  result: CritiqueResult
): Promise<void> {
  const { error } = await admin.from("model_critiques").insert({
    id: result.id,
    run_id: runId,
    round_index: result.roundIndex,
    model_id: result.modelId,
    content: saveHistory ? result.content : null,
    token_usage: result.usage,
    latency_ms: result.latencyMs,
    status: result.status,
    error: result.error ?? null
  });
  assertSupabaseOk("saving model critique", error);
}

export async function persistJudge(
  admin: CouncilAdminClient,
  runId: string,
  saveHistory: boolean,
  result: JudgeResult
): Promise<void> {
  const { error } = await admin.from("judge_rankings").insert({
    id: result.id,
    run_id: runId,
    judge_model: result.modelId,
    rankings: result.rankings,
    synthesis: saveHistory ? result.synthesis : null,
    token_usage: result.usage,
    latency_ms: result.latencyMs,
    status: result.status,
    error: result.error ?? null
  });
  assertSupabaseOk("saving judge result", error);
}

export async function persistCouncilUsage(
  admin: CouncilAdminClient,
  params: { runId: string; userId: string; usage: UsageEvent }
): Promise<void> {
  const { error } = await admin.from("usage_events").insert({
    user_id: params.userId,
    run_id: params.runId,
    stage: params.usage.stage,
    model_id: params.usage.modelId ?? null,
    prompt_tokens: params.usage.promptTokens,
    completion_tokens: params.usage.completionTokens,
    total_tokens: params.usage.totalTokens,
    latency_ms: params.usage.latencyMs,
    status: params.usage.status,
    estimated_cost: params.usage.estimatedCost,
    metadata: { estimated: params.usage.estimated ?? false }
  });
  assertSupabaseOk("saving token usage", error);
}

export function assertSupabaseOk(action: string, error: unknown): void {
  if (!error) return;
  throw new Error(`Supabase data write failed while ${action}: ${getErrorMessage(error)}`);
}
