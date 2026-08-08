import { NextResponse } from "next/server";
import { updateMemberMonthlyBudget } from "@/lib/admin/members";
import { apiRoute, parseJsonBody } from "@/lib/api";
import { requireAdminProfile } from "@/lib/auth";
import { adminUsageBudgetSchema } from "@/lib/validation";

export const PATCH = apiRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdminProfile();
  const { id } = await params;
  const body = adminUsageBudgetSchema.parse(await parseJsonBody(request));
  const monthlyBudgetUsd = await updateMemberMonthlyBudget({
    targetUserId: id,
    monthlyBudgetUsd: body.monthlyBudgetUsd
  });
  return NextResponse.json({ monthlyBudgetUsd });
});
