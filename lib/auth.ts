import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-error";
import { getAppUrl, getOptionalEnv, hasSupabaseEnv } from "@/lib/env";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthProfile, UserRole } from "@/lib/types";

export { ApiError } from "@/lib/api-error";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function initialAdminEmail(): string | undefined {
  const email = getOptionalEnv("INITIAL_ADMIN_EMAIL");
  return email ? normalizeEmail(email) : undefined;
}

export async function isInvitedEmail(email: string): Promise<{ allowed: boolean; role: UserRole }> {
  const normalized = normalizeEmail(email);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("invites")
    .select("role")
    .eq("email", normalized)
    .maybeSingle();

  if (error) throw error;
  if (data) return { allowed: true, role: data.role as UserRole };

  const initialAdmin = initialAdminEmail();
  if (!initialAdmin || normalized !== initialAdmin) {
    return { allowed: false, role: "member" };
  }

  const { count, error: profileCountError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (profileCountError) throw profileCountError;

  return count === 0
    ? { allowed: true, role: "admin" }
    : { allowed: false, role: "member" };
}

export async function sendMagicLink(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const invite = await isInvitedEmail(normalized);

  if (!invite.allowed) {
    return false;
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
  return true;
}

export async function ensureProfile(user: User): Promise<AuthProfile> {
  if (!user.email) {
    throw new ApiError(403, "Authenticated user has no email address.");
  }

  const email = normalizeEmail(user.email);
  const admin = createSupabaseAdminClient();
  const { data: existingProfile, error: existingError } = await admin
    .from("profiles")
    .select("id,email,role,default_save_history,monthly_budget_usd")
    .eq("email", email)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existingProfile) {
    if (existingProfile.id !== user.id) {
      throw new ApiError(409, "This email is linked to a different account. Contact an administrator.");
    }

    const invite = await isInvitedEmail(email);
    if (
      !invite.allowed
      && existingProfile.role === "admin"
      && email === initialAdminEmail()
    ) {
      await persistInitialAdminInvite(user.id, email);
      return existingProfile as AuthProfile;
    }

    if (invite.allowed && existingProfile.role !== invite.role) {
      const { data, error } = await admin
        .from("profiles")
        .update({ role: invite.role, updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .eq("email", email)
        .select("id,email,role,default_save_history,monthly_budget_usd")
        .single();
      if (error) throw error;
      return data as AuthProfile;
    }

    return existingProfile as AuthProfile;
  }

  const invite = await isInvitedEmail(email);
  if (!invite.allowed) {
    throw new ApiError(403, "This account is not invited.");
  }

  const { data, error } = await admin
    .from("profiles")
    .insert(
      {
        id: user.id,
        email,
        role: invite.role
      }
    )
    .select("id,email,role,default_save_history,monthly_budget_usd")
    .single();

  if (error) throw error;

  if (email === initialAdminEmail()) {
    await persistInitialAdminInvite(user.id, email);
  } else {
    await markInviteAccepted(email);
  }

  return data as AuthProfile;
}

async function markInviteAccepted(email: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("email", email)
    .is("accepted_at", null);
  if (error) throw error;
}

async function persistInitialAdminInvite(userId: string, email: string) {
  const { error } = await createSupabaseAdminClient()
    .from("invites")
    .upsert(
      {
        email,
        role: "admin",
        invited_by: userId,
        accepted_at: new Date().toISOString()
      },
      { onConflict: "email" }
    );
  if (error) throw error;
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

export async function updateDefaultSaveHistory(userId: string, defaultSaveHistory: boolean): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({
      default_save_history: defaultSaveHistory,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId)
    .select("default_save_history")
    .single();
  if (error) throw error;
  return Boolean(data.default_save_history);
}

export async function revokeInviteAccess(params: {
  inviteId: string;
  actorUserId: string;
}): Promise<{ revokedProfile: boolean }> {
  const admin = createSupabaseAdminClient();
  const { data: invite, error: inviteError } = await admin
    .from("invites")
    .select("id,email,role,accepted_at")
    .eq("id", params.inviteId)
    .maybeSingle();
  if (inviteError) throw inviteError;
  if (!invite) throw new ApiError(404, "Invite not found.");

  const email = normalizeEmail(invite.email as string);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role")
    .eq("email", email)
    .maybeSingle();
  if (profileError) throw profileError;

  if (profile?.id === params.actorUserId) {
    throw new ApiError(400, "You cannot revoke your own access.");
  }

  if (invite.role === "admin" || profile?.role === "admin") {
    const { count, error: adminCountError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (adminCountError) throw adminCountError;
    if ((count ?? 0) <= 1 && profile?.role === "admin") {
      throw new ApiError(400, "Cannot revoke the last administrator.");
    }
  }

  let revokedProfile = false;
  if (profile) {
    const { error: deleteProfileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", profile.id);
    if (deleteProfileError) throw deleteProfileError;
    revokedProfile = true;

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(profile.id);
    if (deleteAuthError && !/not (found|exist)/i.test(deleteAuthError.message)) {
      throw new ApiError(500, `Profile removed but auth user cleanup failed: ${deleteAuthError.message}`);
    }
  }

  const { error: deleteInviteError } = await admin
    .from("invites")
    .delete()
    .eq("id", params.inviteId);
  if (deleteInviteError) throw deleteInviteError;

  return { revokedProfile };
}
