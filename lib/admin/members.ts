import { ApiError } from "@/lib/api-error";
import type { UsageRange } from "@/lib/admin/usage";
import { getDefaultMonthlyBudgetUsd } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  budgetStatus,
  normalizeMonthlyBudgetUsd,
  roundUsd,
  type BudgetStatus
} from "@/lib/usage";
import type { UserRole } from "@/lib/types";

export type OrgMemberUsage = {
  id: string;
  email: string;
  role: UserRole;
  monthlyBudgetUsd: number | null;
  estimatedCost: number;
  totalTokens: number;
  eventCount: number;
  runCount: number;
  budgetStatus: BudgetStatus;
  percentUsed: number | null;
  remainingUsd: number | null;
};

export type OrgMembersResponse = {
  range: UsageRange;
  defaultMonthlyBudgetUsd: number;
  members: OrgMemberUsage[];
};

type ProfileRow = {
  id: string;
  email: string;
  role: UserRole;
  monthly_budget_usd: number | string | null;
};

type CostRow = {
  user_id: string;
  estimated_cost: number | string | null;
  total_tokens: number | string | null;
};

type CountRow = {
  user_id: string;
};

export function buildOrgMemberUsage(params: {
  profiles: ProfileRow[];
  usageRows: CostRow[];
  runRows: CountRow[];
  defaultMonthlyBudgetUsd: number;
}): OrgMemberUsage[] {
  const costByUser = new Map<string, { cost: number; tokens: number; events: number }>();
  for (const row of params.usageRows) {
    const current = costByUser.get(row.user_id) ?? { cost: 0, tokens: 0, events: 0 };
    current.cost = roundUsd(current.cost + toNumber(row.estimated_cost));
    current.tokens += toNumber(row.total_tokens);
    current.events += 1;
    costByUser.set(row.user_id, current);
  }

  const runsByUser = new Map<string, number>();
  for (const row of params.runRows) {
    runsByUser.set(row.user_id, (runsByUser.get(row.user_id) ?? 0) + 1);
  }

  return params.profiles
    .map((profile) => {
      const usage = costByUser.get(profile.id) ?? { cost: 0, tokens: 0, events: 0 };
      const configuredBudget = toNullableNumber(profile.monthly_budget_usd);
      const monthlyBudgetUsd = configuredBudget ?? params.defaultMonthlyBudgetUsd;
      const status = budgetStatus(monthlyBudgetUsd, usage.cost);
      return {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        monthlyBudgetUsd: configuredBudget,
        estimatedCost: usage.cost,
        totalTokens: usage.tokens,
        eventCount: usage.events,
        runCount: runsByUser.get(profile.id) ?? 0,
        budgetStatus: status,
        percentUsed: monthlyBudgetUsd > 0 ? roundPercent((usage.cost / monthlyBudgetUsd) * 100) : null,
        remainingUsd: monthlyBudgetUsd > 0 ? roundUsd(monthlyBudgetUsd - usage.cost) : null
      };
    })
    .sort((left, right) => right.estimatedCost - left.estimatedCost || left.email.localeCompare(right.email));
}

export async function loadOrgMembersUsage(range: UsageRange): Promise<OrgMembersResponse> {
  const admin = createSupabaseAdminClient();
  const defaultMonthlyBudgetUsd = getDefaultMonthlyBudgetUsd();

  const [profilesResult, usageResult, runsResult] = await Promise.all([
    admin.from("profiles").select("id,email,role,monthly_budget_usd").order("email", { ascending: true }),
    admin
      .from("usage_events")
      .select("user_id,estimated_cost,total_tokens")
      .gte("created_at", range.from)
      .lt("created_at", range.to),
    admin
      .from("council_runs")
      .select("user_id")
      .gte("created_at", range.from)
      .lt("created_at", range.to)
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (usageResult.error) throw usageResult.error;
  if (runsResult.error) throw runsResult.error;

  return {
    range,
    defaultMonthlyBudgetUsd,
    members: buildOrgMemberUsage({
      profiles: (profilesResult.data ?? []) as ProfileRow[],
      usageRows: (usageResult.data ?? []) as CostRow[],
      runRows: (runsResult.data ?? []) as CountRow[],
      defaultMonthlyBudgetUsd
    })
  };
}

export async function updateMemberMonthlyBudget(params: {
  targetUserId: string;
  monthlyBudgetUsd: number | null;
}): Promise<number | null> {
  if (!params.targetUserId) throw new ApiError(400, "Member id is required.");
  const monthlyBudgetUsd = normalizeMonthlyBudgetUsd(params.monthlyBudgetUsd);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ monthly_budget_usd: monthlyBudgetUsd, updated_at: new Date().toISOString() })
    .eq("id", params.targetUserId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Member not found.");
  return monthlyBudgetUsd;
}

function roundPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
