import { NextResponse } from "next/server";
import { parseUsageRange } from "@/lib/admin/usage";
import { loadOrgMembersUsage } from "@/lib/admin/members";
import { apiRoute } from "@/lib/api";
import { requireAdminProfile } from "@/lib/auth";

export const GET = apiRoute(async (request: Request) => {
  await requireAdminProfile();
  const range = parseUsageRange(new URL(request.url));
  const payload = await loadOrgMembersUsage(range);
  return NextResponse.json(payload);
});
