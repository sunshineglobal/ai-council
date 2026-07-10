import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { deleteUserChat, loadUserChatDetails } from "@/lib/chats";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const GET = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireApiProfile();
  const { id } = await params;
  const details = await loadUserChatDetails(createSupabaseAdminClient(), profile.id, id);

  return NextResponse.json(details);
});

export const DELETE = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireApiProfile();
  const { id } = await params;
  await deleteUserChat(createSupabaseAdminClient(), profile.id, id);

  return NextResponse.json({ ok: true });
});
