import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const profile = await requireApiProfile();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("chat_threads")
      .select("id,title,created_at,updated_at")
      .eq("user_id", profile.id)
      .eq("is_ephemeral", false)
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) throw error;
    return NextResponse.json({ chats: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
