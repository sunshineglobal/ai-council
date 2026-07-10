import { ApiError } from "@/lib/api-error";
import { ATTACHMENT_BUCKET } from "@/lib/attachments/constants";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export async function deleteUserAttachments(params: {
  admin: SupabaseAdmin;
  userId: string;
  attachmentIds: string[];
}) {
  const uniqueIds = [...new Set(params.attachmentIds)];
  if (!uniqueIds.length) return;

  const { data, error } = await params.admin
    .from("file_attachments")
    .select("id,object_path")
    .eq("user_id", params.userId)
    .is("deleted_at", null)
    .in("id", uniqueIds);

  if (error) {
    console.warn("[attachments] could not load attachments for cleanup", error);
    return;
  }

  const attachmentIds = (data ?? []).map((row) => row.id as string);
  if (!attachmentIds.length) return;

  const deletedAt = new Date().toISOString();
  const { error: markDeletingError } = await params.admin
    .from("file_attachments")
    .update({ deleted_at: deletedAt })
    .eq("user_id", params.userId)
    .in("id", attachmentIds);

  if (markDeletingError) {
    console.warn("[attachments] could not mark attachments for deletion", markDeletingError);
    return;
  }

  const paths = (data ?? []).map((row) => row.object_path as string).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await params.admin.storage.from(ATTACHMENT_BUCKET).remove(paths);
    if (storageError) {
      console.warn("[attachments] could not remove storage objects", storageError);
      await params.admin
        .from("file_attachments")
        .update({ deleted_at: null })
        .eq("user_id", params.userId)
        .eq("deleted_at", deletedAt)
        .in("id", attachmentIds);
      return;
    }
  }

  const { error: updateError } = await params.admin
    .from("file_attachments")
    .update({
      extracted_text: null,
      text_preview: null,
      extraction_status: "none"
    })
    .eq("user_id", params.userId)
    .eq("deleted_at", deletedAt)
    .in("id", attachmentIds);

  if (updateError) {
    console.warn("[attachments] could not mark attachments deleted", updateError);
  }
}

export async function cleanupEphemeralAttachments(params: {
  admin: SupabaseAdmin;
  userId: string;
  attachmentIds: string[];
}) {
  await deleteUserAttachments(params);
}

export async function deleteUserAttachment(params: {
  admin: SupabaseAdmin;
  userId: string;
  attachmentId: string;
}): Promise<void> {
  const { data, error } = await params.admin
    .from("file_attachments")
    .select("id,object_path")
    .eq("id", params.attachmentId)
    .eq("user_id", params.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(404, "File not found.");

  const deletedAt = new Date().toISOString();
  const { error: markDeletingError } = await params.admin
    .from("file_attachments")
    .update({ deleted_at: deletedAt })
    .eq("id", params.attachmentId)
    .eq("user_id", params.userId);
  if (markDeletingError) throw markDeletingError;

  const objectPath = data.object_path as string;
  if (objectPath) {
    const { error: storageError } = await params.admin.storage.from(ATTACHMENT_BUCKET).remove([objectPath]);
    if (storageError) {
      await params.admin
        .from("file_attachments")
        .update({ deleted_at: null })
        .eq("id", params.attachmentId)
        .eq("user_id", params.userId)
        .eq("deleted_at", deletedAt);
      throw new Error(`Could not remove file from storage: ${storageError.message}`);
    }
  }

  const { error: updateError } = await params.admin
    .from("file_attachments")
    .update({ extracted_text: null, text_preview: null, extraction_status: "none" })
    .eq("id", params.attachmentId)
    .eq("user_id", params.userId)
    .eq("deleted_at", deletedAt);
  if (updateError) throw updateError;
}
