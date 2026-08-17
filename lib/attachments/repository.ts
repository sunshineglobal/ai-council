import { ApiError } from "@/lib/api-error";
import { ATTACHMENT_BUCKET } from "@/lib/attachments/constants";
import { normalizeAttachment } from "@/lib/attachments/text";
import type { AttachmentRow } from "@/lib/attachments/types";
import { MAX_ATTACHMENT_COUNT } from "@/lib/limits";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CouncilAttachment } from "@/lib/types";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export type AttachmentDownload = {
  filename: string;
  contentType: string;
  body: Blob;
};

export async function listUserAttachments(admin: SupabaseAdmin, userId: string): Promise<CouncilAttachment[]> {
  const { data, error } = await admin
    .from("file_attachments")
    .select("id,filename,content_type,file_size,text_preview,extraction_status,extraction_error,created_at,saved_mode")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []).map((row) => normalizeAttachment(row as AttachmentRow));
}

export async function loadUserAttachments(admin: SupabaseAdmin, userId: string, attachmentIds: string[] = []) {
  const uniqueIds = [...new Set(attachmentIds)];
  if (!uniqueIds.length) return [];
  if (uniqueIds.length > MAX_ATTACHMENT_COUNT) {
    throw new ApiError(400, `Attach at most ${MAX_ATTACHMENT_COUNT} files.`);
  }

  const { data, error } = await admin
    .from("file_attachments")
    .select("id,filename,content_type,file_size,extracted_text,text_preview,extraction_status,extraction_error,created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", uniqueIds);

  if (error) throw error;

  const byId = new Map((data ?? []).map((row) => [row.id as string, normalizeAttachment(row as AttachmentRow)]));
  if (byId.size !== uniqueIds.length) {
    throw new ApiError(404, "One or more attached files could not be found.");
  }

  return uniqueIds.map((id) => byId.get(id)).filter(Boolean) as CouncilAttachment[];
}

export async function persistRunAttachments(params: {
  admin: SupabaseAdmin;
  runId: string;
  userId: string;
  attachments: CouncilAttachment[];
}) {
  if (!params.attachments.length) return;

  const { error } = await params.admin.from("run_file_attachments").insert(
    params.attachments.map((attachment, index) => ({
      run_id: params.runId,
      file_id: attachment.id,
      user_id: params.userId,
      filename: attachment.filename,
      content_type: attachment.contentType,
      file_size: attachment.fileSize,
      text_preview: attachment.textPreview ?? null,
      extraction_status: attachment.extractionStatus,
      sort_order: index
    }))
  );

  if (error) throw error;
}

export async function getUserAttachmentDownload(
  admin: SupabaseAdmin,
  userId: string,
  attachmentId: string
): Promise<AttachmentDownload> {
  const { data, error } = await admin
    .from("file_attachments")
    .select("id,filename,content_type,object_path")
    .eq("id", attachmentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data?.object_path) throw new ApiError(404, "File not found.");

  const { data: blob, error: downloadError } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .download(data.object_path as string);
  if (downloadError || !blob) {
    throw new ApiError(404, "File content is unavailable.");
  }

  return {
    filename: data.filename as string,
    contentType: (data.content_type as string) || "text/plain",
    body: blob
  };
}

export async function getUserAttachmentPreview(
  admin: SupabaseAdmin,
  userId: string,
  attachmentId: string
): Promise<CouncilAttachment> {
  const { data, error } = await admin
    .from("file_attachments")
    .select("id,filename,content_type,file_size,text_preview,extraction_status,extraction_error,created_at,saved_mode")
    .eq("id", attachmentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "File not found.");
  return normalizeAttachment(data as AttachmentRow);
}
