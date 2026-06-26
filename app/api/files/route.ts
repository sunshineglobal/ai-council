import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { ATTACHMENT_BUCKET, ensureAttachmentBucket, extractTextFromAttachment, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_COUNT, normalizeAttachment, sanitizeAttachmentFilename } from "@/lib/attachments";
import { ApiError, requireApiProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AttachmentRow } from "@/lib/attachments";
import type { CouncilAttachment } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const profile = await requireApiProfile();
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
      .from("file_attachments")
      .select("id,filename,content_type,file_size,text_preview,extraction_status,extraction_error,created_at")
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    return NextResponse.json({
      files: (data ?? []).map((row) => publicAttachment(normalizeAttachment(row as AttachmentRow)))
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireApiProfile();
    const formData = await request.formData();
    const files = formData.getAll("files").filter(isFile);
    const saveHistory = formData.get("saveHistory") !== "false";

    if (!files.length) throw new ApiError(400, "Choose at least one file to upload.");
    if (files.length > MAX_ATTACHMENT_COUNT) throw new ApiError(400, `Upload at most ${MAX_ATTACHMENT_COUNT} files at a time.`);

    const admin = createSupabaseAdminClient();
    await ensureAttachmentBucket(admin);

    const uploaded: CouncilAttachment[] = [];
    for (const file of files) {
      uploaded.push(await uploadAttachment({ admin, userId: profile.id, file, saveHistory }));
    }

    return NextResponse.json({ files: uploaded.map(publicAttachment) });
  } catch (error) {
    return jsonError(error);
  }
}

async function uploadAttachment(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  file: File;
  saveHistory: boolean;
}) {
  if (params.file.size <= 0) throw new ApiError(400, `${params.file.name || "File"} is empty.`);
  if (params.file.size > MAX_ATTACHMENT_BYTES) {
    throw new ApiError(400, `${params.file.name || "File"} is larger than ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`);
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

  if (uploadError) {
    throw new Error(`File upload failed for ${filename}: ${uploadError.message}`);
  }

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

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value && "size" in value;
}

function publicAttachment(attachment: CouncilAttachment): Omit<CouncilAttachment, "extractedText"> {
  const { extractedText: _extractedText, ...safeAttachment } = attachment;
  return safeAttachment;
}
