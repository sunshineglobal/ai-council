import { NextResponse } from "next/server";
import { apiRoute, parseJsonBody } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { deleteUserChat, loadUserChatDetails, updateUserChatTitle } from "@/lib/chats";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { chatTitleSchema } from "@/lib/validation";

export const GET = apiRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireApiProfile();
  const { id } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const details = await loadUserChatDetails(createSupabaseAdminClient(), profile.id, id, {
    cursor,
    limit: Number.isFinite(limitParam) ? limitParam : 20
  });

  return NextResponse.json(details);
});

export const PATCH = apiRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireApiProfile();
  const { id } = await params;
  const body = chatTitleSchema.parse(await parseJsonBody(request));
  const chat = await updateUserChatTitle(createSupabaseAdminClient(), profile.id, id, body.title);
  return NextResponse.json({ chat });
});

export const DELETE = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireApiProfile();
  const { id } = await params;
  await deleteUserChat(createSupabaseAdminClient(), profile.id, id);

  return NextResponse.json({ ok: true });
});
