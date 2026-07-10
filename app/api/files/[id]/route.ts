import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { deleteUserAttachment } from "@/lib/attachments";
import { requireApiProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export const DELETE = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireApiProfile();
  const { id } = await params;
  await deleteUserAttachment({
    admin: createSupabaseAdminClient(),
    userId: profile.id,
    attachmentId: id
  });
  return NextResponse.json({ ok: true });
});
