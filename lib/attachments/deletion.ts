import { ApiError } from "@/lib/api-error";
import { ATTACHMENT_BUCKET } from "@/lib/attachments/constants";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type AttachmentDeletionTarget = {
  id: string;
  objectPath: string;
};

type DeletionFailureMode = "strict" | "best-effort";
type DeletionFailureStep = "mark" | "storage" | "finalize";

const DELETION_WARNINGS: Record<DeletionFailureStep, string> = {
  mark: "[attachments] could not mark attachments for deletion",
  storage: "[attachments] could not remove storage objects",
  finalize: "[attachments] could not mark attachments deleted"
};

function handleDeletionFailure(params: {
  mode: DeletionFailureMode;
  step: DeletionFailureStep;
  error: unknown;
}): void {
  if (params.mode === "best-effort") {
    console.warn(DELETION_WARNINGS[params.step], params.error);
    return;
  }

  if (params.step === "storage") {
    const message =
      typeof params.error === "object" && params.error && "message" in params.error
        ? String(params.error.message)
        : String(params.error);
    throw new Error(`Could not remove file from storage: ${message}`);
  }

  throw params.error;
}

async function deleteLoadedAttachments(params: {
  admin: SupabaseAdmin;
  userId: string;
  targets: AttachmentDeletionTarget[];
  failureMode: DeletionFailureMode;
}): Promise<void> {
  const attachmentIds = params.targets.map((target) => target.id);
  const deletedAt = new Date().toISOString();
  const { error: markDeletingError } = await params.admin
    .from("file_attachments")
    .update({ deleted_at: deletedAt })
    .eq("user_id", params.userId)
    .in("id", attachmentIds);

  if (markDeletingError) {
    handleDeletionFailure({ mode: params.failureMode, step: "mark", error: markDeletingError });
    return;
  }

  const paths = params.targets.map((target) => target.objectPath).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await params.admin.storage.from(ATTACHMENT_BUCKET).remove(paths);
    if (storageError) {
      await params.admin
        .from("file_attachments")
        .update({ deleted_at: null })
        .eq("user_id", params.userId)
        .eq("deleted_at", deletedAt)
        .in("id", attachmentIds);
      handleDeletionFailure({ mode: params.failureMode, step: "storage", error: storageError });
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
    handleDeletionFailure({ mode: params.failureMode, step: "finalize", error: updateError });
  }
}

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

  const targets = (data ?? []).map((row) => ({
    id: row.id as string,
    objectPath: row.object_path as string
  }));
  if (!targets.length) return;

  await deleteLoadedAttachments({
    admin: params.admin,
    userId: params.userId,
    targets,
    failureMode: "best-effort"
  });
}

export async function cleanupEphemeralAttachments(params: {
  admin: SupabaseAdmin;
  userId: string;
  attachmentIds: string[];
}) {
  await deleteUserAttachments(params);
}

export async function cleanupExpiredEphemeralAttachments(params: {
  admin: SupabaseAdmin;
  olderThan: string;
  limit?: number;
}): Promise<number> {
  const { data, error } = await params.admin
    .from("file_attachments")
    .select("id,user_id,object_path")
    .eq("saved_mode", false)
    .is("deleted_at", null)
    .lt("created_at", params.olderThan)
    .order("created_at", { ascending: true })
    .limit(params.limit ?? 200);

  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; user_id: string; object_path: string }>;
  const byUser = new Map<string, AttachmentDeletionTarget[]>();
  for (const row of rows) {
    byUser.set(row.user_id, [
      ...(byUser.get(row.user_id) ?? []),
      { id: row.id, objectPath: row.object_path }
    ]);
  }

  for (const [userId, targets] of byUser) {
    await deleteLoadedAttachments({
      admin: params.admin,
      userId,
      targets,
      failureMode: "best-effort"
    });
  }

  return rows.length;
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

  await deleteLoadedAttachments({
    admin: params.admin,
    userId: params.userId,
    targets: [{ id: data.id as string, objectPath: data.object_path as string }],
    failureMode: "strict"
  });
}
