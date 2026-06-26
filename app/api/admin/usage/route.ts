import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { ApiError, requireAdminProfile } from "@/lib/auth";
import { fetchOpenRouterModels } from "@/lib/openrouter";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  aggregateUsageRows,
  budgetStatus,
  normalizeMonthlyBudgetUsd,
  pricingMapFromModels,
  roundUsd,
  type ModelPricingMap,
  type UsageRow
} from "@/lib/usage";
import { adminUsageBudgetSchema } from "@/lib/validation";

type CouncilRunRow = {
  id: string;
  prompt_text: string | null;
  status: string;
  created_at: string;
  models: string[];
  judge_model: string;
  debate_depth: number;
  research_enabled: boolean;
  latency_ms: number;
  cost_estimate: number | string | null;
  token_totals: { totalTokens?: number; total_tokens?: number } | null;
};

type ResearchRow = {
  firecrawl_credits: number | string | null;
  result_count: number | string | null;
};

export async function GET(request: Request) {
  try {
    const profile = await requireAdminProfile();
    const range = parseRange(new URL(request.url));
    const admin = createSupabaseAdminClient();
    const pricingByModel = await loadPricingByModel();

    const [usageResult, runsResult, researchResult, evalResult] = await Promise.all([
      admin
        .from("usage_events")
        .select("run_id,stage,model_id,prompt_tokens,completion_tokens,total_tokens,latency_ms,status,estimated_cost,metadata")
        .eq("user_id", profile.id)
        .gte("created_at", range.from)
        .lt("created_at", range.to),
      admin
        .from("council_runs")
        .select("id,prompt_text,status,created_at,models,judge_model,debate_depth,research_enabled,latency_ms,cost_estimate,token_totals")
        .eq("user_id", profile.id)
        .gte("created_at", range.from)
        .lt("created_at", range.to)
        .order("created_at", { ascending: false })
        .limit(10),
      admin
        .from("research_results")
        .select("firecrawl_credits,result_count")
        .eq("user_id", profile.id)
        .gte("created_at", range.from)
        .lt("created_at", range.to),
      admin
        .from("eval_runs")
        .select("id")
        .eq("user_id", profile.id)
        .gte("created_at", range.from)
        .lt("created_at", range.to)
    ]);

    if (usageResult.error) throw usageResult.error;
    if (runsResult.error) throw runsResult.error;
    if (researchResult.error) throw researchResult.error;
    if (evalResult.error) throw evalResult.error;

    const usageRows = (usageResult.data ?? []) as UsageRow[];
    const aggregate = aggregateUsageRows(usageRows, pricingByModel);
    const monthlyBudgetUsd = toNullableNumber(profile.monthly_budget_usd);
    const status = budgetStatus(monthlyBudgetUsd, aggregate.estimatedCost);
    const firecrawl = summarizeFirecrawl((researchResult.data ?? []) as ResearchRow[]);

    return NextResponse.json({
      range,
      budget: {
        monthlyBudgetUsd,
        status,
        percentUsed: monthlyBudgetUsd && monthlyBudgetUsd > 0 ? roundPercent((aggregate.estimatedCost / monthlyBudgetUsd) * 100) : null,
        remainingUsd: monthlyBudgetUsd && monthlyBudgetUsd > 0 ? roundUsd(monthlyBudgetUsd - aggregate.estimatedCost) : null
      },
      totals: {
        promptTokens: aggregate.promptTokens,
        completionTokens: aggregate.completionTokens,
        totalTokens: aggregate.totalTokens,
        estimated: aggregate.estimated,
        estimatedCost: aggregate.estimatedCost,
        eventCount: aggregate.eventCount,
        latencyMs: aggregate.latencyMs,
        evalCount: (evalResult.data ?? []).length,
        firecrawlCredits: firecrawl.credits,
        firecrawlResults: firecrawl.results
      },
      byStage: aggregate.byStage,
      byModel: aggregate.byModel,
      recentRuns: summarizeRuns((runsResult.data ?? []) as CouncilRunRow[], usageRows, pricingByModel)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requireAdminProfile();
    const body = adminUsageBudgetSchema.parse(await request.json());
    const monthlyBudgetUsd = normalizeMonthlyBudgetUsd(body.monthlyBudgetUsd);
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ monthly_budget_usd: monthlyBudgetUsd, updated_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (error) throw error;
    return NextResponse.json({ monthlyBudgetUsd });
  } catch (error) {
    return jsonError(error);
  }
}

function parseRange(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) throw new ApiError(400, "Usage range requires from and to ISO timestamps.");

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) || fromDate >= toDate) {
    throw new ApiError(400, "Usage range must have valid from and to ISO timestamps.");
  }

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString()
  };
}

async function loadPricingByModel(): Promise<ModelPricingMap> {
  try {
    return pricingMapFromModels(await fetchOpenRouterModels());
  } catch {
    return {};
  }
}

function summarizeRuns(rows: CouncilRunRow[], usageRows: UsageRow[], pricingByModel: ModelPricingMap) {
  const usageByRun = new Map<string, UsageRow[]>();
  for (const usage of usageRows) {
    if (!usage.run_id) continue;
    usageByRun.set(usage.run_id, [...(usageByRun.get(usage.run_id) ?? []), usage]);
  }

  return rows.map((run) => {
    const usage = aggregateUsageRows(usageByRun.get(run.id) ?? [], pricingByModel);
    const storedCost = toNumber(run.cost_estimate);
    const totalTokens = toNumber(run.token_totals?.totalTokens ?? run.token_totals?.total_tokens ?? usage.totalTokens);

    return {
      id: run.id,
      prompt: run.prompt_text,
      status: run.status,
      createdAt: run.created_at,
      models: run.models,
      judgeModel: run.judge_model,
      debateDepth: run.debate_depth,
      researchEnabled: run.research_enabled,
      latencyMs: toNumber(run.latency_ms),
      totalTokens,
      estimatedCost: storedCost > 0 ? roundUsd(storedCost) : usage.estimatedCost
    };
  });
}

function summarizeFirecrawl(rows: ResearchRow[]) {
  return rows.reduce(
    (summary, row) => ({
      credits: roundUsd(summary.credits + toNumber(row.firecrawl_credits)),
      results: summary.results + toNumber(row.result_count)
    }),
    { credits: 0, results: 0 }
  );
}

function roundPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
