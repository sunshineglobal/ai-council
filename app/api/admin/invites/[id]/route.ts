import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { requireAdminProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const DELETE = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdminProfile();
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("invites").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Invite not found.");
  return NextResponse.json({ ok: true });
});
