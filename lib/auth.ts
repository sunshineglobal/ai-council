import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getAppUrl, getOptionalEnv, hasSupabaseEnv } from "@/lib/env";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthProfile, UserRole } from "@/lib/types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function initialAdminEmail(): string | undefined {
  const email = getOptionalEnv("INITIAL_ADMIN_EMAIL");
  return email ? normalizeEmail(email) : undefined;
}

export async function isInvitedEmail(email: string): Promise<{ allowed: boolean; role: UserRole }> {
  const normalized = normalizeEmail(email);
  const initialAdmin = initialAdminEmail();
  if (initialAdmin && normalized === initialAdmin) {
    return { allowed: true, role: "admin" };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("invites")
    .select("role")
    .eq("email", normalized)
    .maybeSingle();

  if (error) throw error;
  return data ? { allowed: true, role: data.role as UserRole } : { allowed: false, role: "member" };
}

export async function sendMagicLink(email: string) {
  const normalized = normalizeEmail(email);
  const invite = await isInvitedEmail(normalized);

  if (!invite.allowed) {
    throw new ApiError(403, "That email is not on the invite list.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=/app`
    }
  });

  if (error) throw new ApiError(400, error.message);
}

export async function ensureProfile(user: User): Promise<AuthProfile> {
  if (!user.email) {
    throw new ApiError(403, "Authenticated user has no email address.");
  }

  const email = normalizeEmail(user.email);
  const invite = await isInvitedEmail(email);

  if (!invite.allowed) {
    throw new ApiError(403, "This account is not invited.");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email,
        role: invite.role
      },
      { onConflict: "id" }
    )
    .select("id,email,role,default_save_history")
    .single();

  if (error) throw error;

  await admin
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("email", email)
    .is("accepted_at", null);

  return data as AuthProfile;
}

export async function getCurrentProfile(): Promise<AuthProfile | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return ensureProfile(data.user);
}

export async function requirePageProfile(): Promise<AuthProfile> {
  if (!hasSupabaseEnv()) redirect("/setup");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireApiProfile(): Promise<AuthProfile> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new ApiError(401, "Sign in required.");
  }
  return ensureProfile(data.user);
}

export async function requireAdminProfile(): Promise<AuthProfile> {
  const profile = await requireApiProfile();
  if (profile.role !== "admin") {
    throw new ApiError(403, "Admin access required.");
  }
  return profile;
}
