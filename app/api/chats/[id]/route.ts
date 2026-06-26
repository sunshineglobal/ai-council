import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { deleteUserAttachments } from "@/lib/attachments";
import { ApiError, requireApiProfile } from "@/lib/auth";
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await requireApiProfile();
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: thread, error: threadError } = await admin
      .from("chat_threads")
      .select("id")
      .eq("id", id)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (threadError) throw threadError;
    if (!thread) throw new ApiError(404, "Chat not found.");

    const { data: runs, error: runsError } = await admin
      .from("council_runs")
      .select("id")
      .eq("thread_id", id)
      .eq("user_id", profile.id);

    if (runsError) throw runsError;

    const runIds = (runs ?? []).map((run) => run.id as string);
    const attachmentIds = new Set<string>();

    if (runIds.length) {
      const { data: attachments, error: attachmentsError } = await admin
        .from("run_file_attachments")
        .select("file_id")
        .eq("user_id", profile.id)
        .in("run_id", runIds);

      if (attachmentsError) throw attachmentsError;
      for (const attachment of attachments ?? []) {
        const fileId = attachment.file_id as string | null;
        if (fileId) attachmentIds.add(fileId);
      }
    }

    const { error: deleteError } = await admin
      .from("chat_threads")
      .delete()
      .eq("id", id)
      .eq("user_id", profile.id);

    if (deleteError) throw deleteError;

    const candidateAttachmentIds = [...attachmentIds];
    let removableAttachmentIds = candidateAttachmentIds;

    if (candidateAttachmentIds.length) {
      const { data: remainingAttachments, error: remainingAttachmentsError } = await admin
        .from("run_file_attachments")
        .select("file_id")
        .eq("user_id", profile.id)
        .in("file_id", candidateAttachmentIds);

      if (remainingAttachmentsError) {
        console.warn("[chats] could not check remaining attachment references", remainingAttachmentsError);
        removableAttachmentIds = [];
      } else {
        const stillReferenced = new Set(
          (remainingAttachments ?? [])
            .map((attachment) => attachment.file_id as string | null)
            .filter(Boolean)
        );
        removableAttachmentIds = candidateAttachmentIds.filter((fileId) => !stillReferenced.has(fileId));
      }
    }

    await deleteUserAttachments({
      admin,
      userId: profile.id,
      attachmentIds: removableAttachmentIds
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
