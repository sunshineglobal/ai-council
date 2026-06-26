import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { normalizeEmail, requireAdminProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { inviteSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdminProfile();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("invites").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ invites: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
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
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ invite: data });
  } catch (error) {
    return jsonError(error);
  }
}
