import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireAdminProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminProfile();
    const { id } = await params;
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("invites").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
