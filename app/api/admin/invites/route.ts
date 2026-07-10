import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { normalizeEmail, requireAdminProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { inviteSchema } from "@/lib/validation";

export const GET = apiRoute(async () => {
  await requireAdminProfile();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("invites")
    .select("id,email,role,accepted_at,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ invites: data ?? [] });
});

export const POST = apiRoute(async (request: Request) => {
  const profile = await requireAdminProfile();
  const body = inviteSchema.parse(await request.json());
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("invites")
    .upsert(
      {
        email: normalizeEmail(body.email),
        role: body.role,
        invited_by: profile.id
      },
      { onConflict: "email" }
    )
    .select("id,email,role,accepted_at,created_at")
    .single();
  if (error) throw error;
  return NextResponse.json({ invite: data });
});
