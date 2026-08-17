import { NextResponse } from "next/server";
import { loadAdminUsage, parseUsageRange } from "@/lib/admin/usage";
import { apiRoute } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";

export const GET = apiRoute(async (request: Request) => {
  const profile = await requireApiProfile();
  const usage = await loadAdminUsage({
    userId: profile.id,
    monthlyBudgetUsd: profile.monthly_budget_usd,
    range: parseUsageRange(new URL(request.url))
  });
  return NextResponse.json(usage);
});
