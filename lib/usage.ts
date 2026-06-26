import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CouncilStage, ModelOption, TokenUsage, UsageEvent } from "@/lib/types";

export type BudgetStatus = "unset" | "ok" | "warning" | "over";

export type UsageRow = {
  run_id?: string | null;
  stage: CouncilStage;
  model_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status: "complete" | "error" | "estimated";
  estimated_cost: number | string | null;
  metadata?: { estimated?: boolean } | null;
};

export type UsageBreakdownRow = TokenUsage & {
  name: string;
  eventCount: number;
  latencyMs: number;
  estimatedCost: number;
};

export type UsageAggregate = TokenUsage & {
  eventCount: number;
  estimatedCost: number;
  latencyMs: number;
  byStage: UsageBreakdownRow[];
  byModel: UsageBreakdownRow[];
};

export type ModelPricing = {
  prompt?: string;
  completion?: string;
};

export type ModelPricingMap = Record<string, ModelPricing | undefined>;

export function parsePricingValue(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

export function estimateUsageCost(usage: Pick<TokenUsage, "promptTokens" | "completionTokens">, pricing?: ModelPricing): number {
  const promptPrice = parsePricingValue(pricing?.prompt);
  const completionPrice = parsePricingValue(pricing?.completion);

  return roundUsd((usage.promptTokens * (promptPrice ?? 0)) + (usage.completionTokens * (completionPrice ?? 0)));
}

export function pricingMapFromModels(models: ModelOption[]): ModelPricingMap {
  return Object.fromEntries(models.map((model) => [model.id, model.pricing]));
}

export function buildUsageEvent(params: {
  stage: CouncilStage;
  modelId?: string;
  usage: TokenUsage;
  latencyMs: number;
  status?: UsageEvent["status"];
  pricing?: ModelPricing;
}): UsageEvent {
  return {
    stage: params.stage,
    modelId: params.modelId,
    promptTokens: params.usage.promptTokens,
    completionTokens: params.usage.completionTokens,
    totalTokens: params.usage.totalTokens,
    estimated: params.usage.estimated,
    latencyMs: params.latencyMs,
    status: params.status ?? (params.usage.estimated ? "estimated" : "complete"),
    estimatedCost: params.modelId === "firecrawl" ? 0 : estimateUsageCost(params.usage, params.pricing)
  };
}

export async function persistUsageEvent(params: {
  runId?: string;
  userId: string;
  usage: UsageEvent;
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("usage_events").insert({
    user_id: params.userId,
    run_id: params.runId ?? null,
    stage: params.usage.stage,
    model_id: params.usage.modelId ?? null,
    prompt_tokens: params.usage.promptTokens,
    completion_tokens: params.usage.completionTokens,
    total_tokens: params.usage.totalTokens,
    latency_ms: params.usage.latencyMs,
    status: params.usage.status,
    estimated_cost: params.usage.estimatedCost,
    metadata: {
      estimated: params.usage.estimated ?? false,
      ...params.metadata
    }
  });
  if (error) throw error;
}

export function aggregateUsageRows(rows: UsageRow[], pricingByModel: ModelPricingMap = {}): UsageAggregate {
  const totals: UsageAggregate = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimated: false,
    eventCount: 0,
    estimatedCost: 0,
    latencyMs: 0,
    byStage: [],
    byModel: []
  };
  const byStage = new Map<string, UsageBreakdownRow>();
  const byModel = new Map<string, UsageBreakdownRow>();

  for (const row of rows) {
    const usage = rowToUsage(row);
    const cost = usageCostForRow(row, usage, pricingByModel);

    totals.promptTokens += usage.promptTokens;
    totals.completionTokens += usage.completionTokens;
    totals.totalTokens += usage.totalTokens;
    totals.estimated = Boolean(totals.estimated || usage.estimated);
    totals.eventCount += 1;
    totals.estimatedCost = roundUsd(totals.estimatedCost + cost);
    totals.latencyMs += usage.latencyMs;

    addBreakdown(byStage, row.stage, usage, cost);
    addBreakdown(byModel, row.model_id ?? "unknown", usage, cost);
  }

  totals.byStage = sortBreakdown(byStage);
  totals.byModel = sortBreakdown(byModel);
  return totals;
}

export function budgetStatus(monthlyBudgetUsd: number | null | undefined, estimatedCost: number): BudgetStatus {
  if (monthlyBudgetUsd === null || monthlyBudgetUsd === undefined || monthlyBudgetUsd <= 0) return "unset";
  const ratio = estimatedCost / monthlyBudgetUsd;
  if (ratio >= 1) return "over";
  if (ratio >= 0.8) return "warning";
  return "ok";
}

export function normalizeMonthlyBudgetUsd(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 999999.999999) {
    throw new Error("Monthly budget must be between 0 and 999999.999999.");
  }
  return roundUsd(value);
}

export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function rowToUsage(row: UsageRow): UsageEvent {
  return {
    stage: row.stage,
    modelId: row.model_id ?? undefined,
    promptTokens: toNumber(row.prompt_tokens),
    completionTokens: toNumber(row.completion_tokens),
    totalTokens: toNumber(row.total_tokens),
    latencyMs: toNumber(row.latency_ms),
    status: row.status,
    estimated: row.metadata?.estimated ?? row.status === "estimated",
    estimatedCost: toNumber(row.estimated_cost)
  };
}

function usageCostForRow(row: UsageRow, usage: UsageEvent, pricingByModel: ModelPricingMap) {
  if (usage.estimatedCost > 0) return usage.estimatedCost;
  if (!row.model_id || row.model_id === "firecrawl") return 0;
  return estimateUsageCost(usage, pricingByModel[row.model_id]);
}

function addBreakdown(map: Map<string, UsageBreakdownRow>, name: string, usage: UsageEvent, estimatedCost: number) {
  const current =
    map.get(name) ??
    {
      name,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimated: false,
      eventCount: 0,
      latencyMs: 0,
      estimatedCost: 0
    };

  current.promptTokens += usage.promptTokens;
  current.completionTokens += usage.completionTokens;
  current.totalTokens += usage.totalTokens;
  current.estimated = Boolean(current.estimated || usage.estimated);
  current.eventCount += 1;
  current.latencyMs += usage.latencyMs;
  current.estimatedCost = roundUsd(current.estimatedCost + estimatedCost);
  map.set(name, current);
}

function sortBreakdown(map: Map<string, UsageBreakdownRow>) {
  return Array.from(map.values()).sort((a, b) => b.estimatedCost - a.estimatedCost || b.totalTokens - a.totalTokens);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
