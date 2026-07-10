import { deleteUserAttachments } from "@/lib/attachments";
import { ApiError } from "@/lib/api-error";
import type {
  StoredCritique,
  StoredJudge,
  StoredModelResponse,
  StoredResearch,
  StoredRun,
  StoredRunAttachment,
  StoredUsage,
  ThreadPayload
} from "@/lib/chats/types";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";

type ChatAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ChatDetailsInput = {
  thread: ThreadPayload["thread"];
  runs: StoredRun[];
  responses: StoredModelResponse[];
  critiques: StoredCritique[];
  judges: StoredJudge[];
  research: StoredResearch[];
  usage: StoredUsage[];
  attachments: StoredRunAttachment[];
};

export function assembleChatDetails(input: ChatDetailsInput): ThreadPayload {
  const attachmentsByRunId = new Map<string, StoredRunAttachment[]>();
  for (const attachment of input.attachments) {
    const current = attachmentsByRunId.get(attachment.run_id) ?? [];
    attachmentsByRunId.set(attachment.run_id, [...current, attachment]);
  }

  return {
    thread: input.thread,
    runs: input.runs.map((run) => ({
      ...run,
      attachments: attachmentsByRunId.get(run.id) ?? []
    })),
    responses: input.responses,
    critiques: input.critiques,
    judges: input.judges,
    research: input.research,
    usage: input.usage,
    attachments: input.attachments
  };
}

export function findUnreferencedAttachmentIds(
  candidateAttachmentIds: string[],
  remainingAttachments: Array<{ file_id: string | null }>
): string[] {
  const stillReferenced = new Set(
    remainingAttachments
      .map((attachment) => attachment.file_id)
      .filter((fileId): fileId is string => Boolean(fileId))
  );

  return candidateAttachmentIds.filter((fileId) => !stillReferenced.has(fileId));
}

export async function listUserChats(admin: ChatAdminClient, userId: string) {
  const { data, error } = await admin
    .from("chat_threads")
    .select("id,title,created_at,updated_at")
    .eq("user_id", userId)
    .eq("is_ephemeral", false)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) throw error;
  return data ?? [];
}

export async function loadUserChatDetails(admin: ChatAdminClient, userId: string, chatId: string) {
  const { data: thread, error: threadError } = await admin
    .from("chat_threads")
    .select("id,title")
    .eq("id", chatId)
    .eq("user_id", userId)
    .maybeSingle();
  if (threadError) throw threadError;
  if (!thread) throw new ApiError(404, "Chat not found.");

  const { data: runs, error: runsError } = await admin
    .from("council_runs")
    .select("id,prompt_text,final_answer,token_totals,created_at,models,judge_model,debate_depth,research_enabled,latency_ms")
    .eq("thread_id", chatId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (runsError) throw runsError;

  const runIds = (runs ?? []).map((run) => run.id as string);
  const [responses, critiques, judges, research, usage, attachments] = await Promise.all([
    runIds.length
      ? admin.from("model_responses").select("id,run_id,model_id,stage,content,token_usage,latency_ms,status,error").in("run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? admin.from("model_critiques").select("id,run_id,round_index,model_id,content,token_usage,latency_ms,status,error").in("run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? admin.from("judge_rankings").select("id,run_id,judge_model,rankings,synthesis,token_usage,latency_ms,status,error").in("run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? admin.from("research_results").select("run_id,query,results,result_count,firecrawl_credits").in("run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? admin.from("usage_events").select("run_id,stage,model_id,prompt_tokens,completion_tokens,total_tokens,latency_ms,status,estimated_cost").in("run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? admin
          .from("run_file_attachments")
          .select("id,run_id,file_id,filename,content_type,file_size,text_preview,extraction_status,created_at")
          .in("run_id", runIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);

  for (const [name, result] of [
    ["model responses", responses],
    ["model critiques", critiques],
    ["judge rankings", judges],
    ["research results", research],
    ["usage events", usage],
    ["file attachments", attachments]
  ] as const) {
    if (result.error) {
      throw new Error(`Could not load ${name}: ${result.error.message}`);
    }
  }

  return assembleChatDetails({
    thread: thread as ThreadPayload["thread"],
    runs: (runs ?? []) as StoredRun[],
    responses: (responses.data ?? []) as StoredModelResponse[],
    critiques: (critiques.data ?? []) as StoredCritique[],
    judges: (judges.data ?? []) as StoredJudge[],
    research: (research.data ?? []) as StoredResearch[],
    usage: (usage.data ?? []) as StoredUsage[],
    attachments: (attachments.data ?? []) as StoredRunAttachment[]
  });
}

export async function deleteUserChat(admin: ChatAdminClient, userId: string, chatId: string) {
  const { data: thread, error: threadError } = await admin
    .from("chat_threads")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (threadError) throw threadError;
  if (!thread) throw new ApiError(404, "Chat not found.");

  const { data: runs, error: runsError } = await admin
    .from("council_runs")
    .select("id")
    .eq("thread_id", chatId)
    .eq("user_id", userId);

  if (runsError) throw runsError;

  const runIds = (runs ?? []).map((run) => run.id as string);
  const attachmentIds = new Set<string>();

  if (runIds.length) {
    const { data: attachments, error: attachmentsError } = await admin
      .from("run_file_attachments")
      .select("file_id")
      .eq("user_id", userId)
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
    .eq("id", chatId)
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  const candidateAttachmentIds = [...attachmentIds];
  let removableAttachmentIds = candidateAttachmentIds;

  if (candidateAttachmentIds.length) {
    const { data: remainingAttachments, error: remainingAttachmentsError } = await admin
      .from("run_file_attachments")
      .select("file_id")
      .eq("user_id", userId)
      .in("file_id", candidateAttachmentIds);

    if (remainingAttachmentsError) {
      console.warn("[chats] could not check remaining attachment references", remainingAttachmentsError);
      removableAttachmentIds = [];
    } else {
      removableAttachmentIds = findUnreferencedAttachmentIds(
        candidateAttachmentIds,
        (remainingAttachments ?? []) as Array<{ file_id: string | null }>
      );
    }
  }

  await deleteUserAttachments({
    admin,
    userId,
    attachmentIds: removableAttachmentIds
  });
}
