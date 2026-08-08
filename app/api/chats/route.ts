import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { listUserChats } from "@/lib/chats";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const GET = apiRoute(async (request: Request) => {
  const profile = await requireApiProfile();
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = Number(url.searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(limitParam) ? limitParam : 40;
  const page = await listUserChats(createSupabaseAdminClient(), profile.id, {
    cursor,
    limit
  });

  return NextResponse.json(page);
});
