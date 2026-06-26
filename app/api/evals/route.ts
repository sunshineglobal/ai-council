import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const profile = await requireApiProfile();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("eval_runs")
      .select("*, eval_sets(name, rubric), eval_scores(*)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return NextResponse.json({ evals: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
