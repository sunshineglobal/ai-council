import { NextResponse } from "next/server";
import { loadMemberUsage, parseUsageRange } from "@/lib/admin/usage";
import { apiRoute } from "@/lib/api";
import { requireAdminProfile } from "@/lib/auth";

export const GET = apiRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdminProfile();
  const { id } = await params;
  const usage = await loadMemberUsage({
    targetUserId: id,
    range: parseUsageRange(new URL(request.url))
  });
  return NextResponse.json(usage);
});
