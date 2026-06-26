import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await requireApiProfile();
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: thread, error: threadError } = await admin
      .from("chat_threads")
      .select("*")
      .eq("id", id)
      .eq("user_id", profile.id)
      .single();
    if (threadError) throw threadError;

    const { data: runs, error: runsError } = await admin
      .from("council_runs")
      .select("*")
      .eq("thread_id", id)
      .eq("user_id", profile.id)
      .order("created_at", { ascending: true });
    if (runsError) throw runsError;

    const runIds = (runs ?? []).map((run) => run.id as string);
    const [responses, critiques, judges, research, usage, attachments] = await Promise.all([
      runIds.length ? admin.from("model_responses").select("*").in("run_id", runIds) : Promise.resolve({ data: [] }),
      runIds.length ? admin.from("model_critiques").select("*").in("run_id", runIds) : Promise.resolve({ data: [] }),
      runIds.length ? admin.from("judge_rankings").select("*").in("run_id", runIds) : Promise.resolve({ data: [] }),
      runIds.length ? admin.from("research_results").select("*").in("run_id", runIds) : Promise.resolve({ data: [] }),
      runIds.length ? admin.from("usage_events").select("*").in("run_id", runIds) : Promise.resolve({ data: [] }),
      runIds.length
        ? admin.from("run_file_attachments").select("*").in("run_id", runIds).order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] })
    ]);

    const attachmentsByRunId = new Map<string, unknown[]>();
    for (const attachment of attachments.data ?? []) {
      const runId = attachment.run_id as string;
      attachmentsByRunId.set(runId, [...(attachmentsByRunId.get(runId) ?? []), attachment]);
    }

    return NextResponse.json({
      thread,
      runs: (runs ?? []).map((run) => ({
        ...run,
        attachments: attachmentsByRunId.get(run.id as string) ?? []
      })),
      responses: responses.data ?? [],
      critiques: critiques.data ?? [],
      judges: judges.data ?? [],
      research: research.data ?? [],
      usage: usage.data ?? [],
      attachments: attachments.data ?? []
    });
  } catch (error) {
    return jsonError(error);
  }
}
