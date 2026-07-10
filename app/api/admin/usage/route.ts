import { NextResponse } from "next/server";
import { loadAdminUsage, parseUsageRange, updateAdminMonthlyBudget } from "@/lib/admin/usage";
import { apiRoute } from "@/lib/api";
import { requireAdminProfile } from "@/lib/auth";
import { adminUsageBudgetSchema } from "@/lib/validation";

export const GET = apiRoute(async (request: Request) => {
  const profile = await requireAdminProfile();
  const usage = await loadAdminUsage({
    userId: profile.id,
    monthlyBudgetUsd: profile.monthly_budget_usd,
    range: parseUsageRange(new URL(request.url))
  });
  return NextResponse.json(usage);
});

export const PATCH = apiRoute(async (request: Request) => {
  const profile = await requireAdminProfile();
  const body = adminUsageBudgetSchema.parse(await request.json());
  const monthlyBudgetUsd = await updateAdminMonthlyBudget({
    userId: profile.id,
    monthlyBudgetUsd: body.monthlyBudgetUsd
  });
  return NextResponse.json({ monthlyBudgetUsd });
});
