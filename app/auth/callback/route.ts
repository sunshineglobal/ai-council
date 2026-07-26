import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localRedirectPath } from "@/lib/urls";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = getAppUrl();
  const code = url.searchParams.get("code");
  const next = localRedirectPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth_callback_failed", appUrl));
    }
  }

  return NextResponse.redirect(new URL(next, appUrl));
}
