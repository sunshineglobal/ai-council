import { Buffer } from "node:buffer";
import { ApiError } from "@/lib/api-error";
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES } from "@/lib/attachments/constants";
import { deleteUserAttachments } from "@/lib/attachments/deletion";
import {
  extractTextFromAttachment,
  normalizeAttachment,
  sanitizeAttachmentFilename
} from "@/lib/attachments/text";
import type { AttachmentRow } from "@/lib/attachments/types";
import { MAX_ATTACHMENT_COUNT } from "@/lib/limits";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CouncilAttachment } from "@/lib/types";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export async function ensureAttachmentBucket(admin: SupabaseAdmin) {
  const { data } = await admin.storage.getBucket(ATTACHMENT_BUCKET);
  if (data) return;

  const { error } = await admin.storage.createBucket(ATTACHMENT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_ATTACHMENT_BYTES
  });

  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Could not create attachment storage bucket: ${error.message}`);
  }
}

export async function uploadUserAttachments(params: {
  admin: SupabaseAdmin;
  userId: string;
  files: File[];
  saveHistory: boolean;
}): Promise<CouncilAttachment[]> {
  if (!params.files.length) throw new ApiError(400, "Choose at least one file to upload.");
  if (params.files.length > MAX_ATTACHMENT_COUNT) {
    throw new ApiError(400, `Upload at most ${MAX_ATTACHMENT_COUNT} files at a time.`);
  }

  await ensureAttachmentBucket(params.admin);
  const uploaded: CouncilAttachment[] = [];

  try {
    for (const file of params.files) {
      uploaded.push(await uploadUserAttachment({ ...params, file }));
    }
  } catch (error) {
    await deleteUserAttachments({
      admin: params.admin,
      userId: params.userId,
      attachmentIds: uploaded.map((attachment) => attachment.id)
    });
    throw error;
  }

  return uploaded;
}

async function uploadUserAttachment(params: {
  admin: SupabaseAdmin;
  userId: string;
  file: File;
  saveHistory: boolean;
}): Promise<CouncilAttachment> {
  if (params.file.size <= 0) throw new ApiError(400, `${params.file.name || "File"} is empty.`);
  if (params.file.size > MAX_ATTACHMENT_BYTES) {
    throw new ApiError(
      400,
      `${params.file.name || "File"} is larger than ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`
    );
  }

  const id = crypto.randomUUID();
  const filename = sanitizeAttachmentFilename(params.file.name || "attachment.txt");
  const contentType = params.file.type || "application/octet-stream";
  const objectPath = `${params.userId}/${id}/${filename}`;
  const bytes = Buffer.from(await params.file.arrayBuffer());
  const extraction = extractTextFromAttachment(bytes, filename, contentType);

  const { error: uploadError } = await params.admin.storage.from(ATTACHMENT_BUCKET).upload(objectPath, bytes, {
    contentType,
    upsert: false
  });
  if (uploadError) throw new Error(`File upload failed for ${filename}: ${uploadError.message}`);

  const { data, error } = await params.admin
    .from("file_attachments")
    .insert({
      id,
      user_id: params.userId,
      bucket_id: ATTACHMENT_BUCKET,
      object_path: objectPath,
      filename,
      content_type: contentType,
      file_size: params.file.size,
      extracted_text: extraction.extractedText,
      text_preview: extraction.textPreview,
      extraction_status: extraction.extractionStatus,
      extraction_error: extraction.extractionError ?? null,
      saved_mode: params.saveHistory
    })
    .select("id,filename,content_type,file_size,text_preview,extraction_status,extraction_error,created_at")
    .single();

  if (error) {
    await params.admin.storage.from(ATTACHMENT_BUCKET).remove([objectPath]);
    throw error;
  }

  return normalizeAttachment(data as AttachmentRow);
}
