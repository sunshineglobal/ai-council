import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireAdminProfile, revokeInviteAccess } from "@/lib/auth";

export const DELETE = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireAdminProfile();
  const { id } = await params;
  const result = await revokeInviteAccess({
    inviteId: id,
    actorUserId: profile.id
  });
  return NextResponse.json({ ok: true, ...result });
});
