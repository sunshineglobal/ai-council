import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { listUserChats } from "@/lib/chats";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const GET = apiRoute(async () => {
  const profile = await requireApiProfile();
  const chats = await listUserChats(createSupabaseAdminClient(), profile.id);

  return NextResponse.json({ chats });
});
