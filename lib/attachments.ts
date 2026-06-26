import { ApiError } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CouncilAttachment } from "@/lib/types";

export const ATTACHMENT_BUCKET = "council-attachments";
export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 80_000;
export const MAX_ATTACHMENT_CONTEXT_CHARS = 28_000;
export const MAX_ATTACHMENT_CONTEXT_CHARS_PER_FILE = 12_000;

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "xml",
  "html",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "cs",
  "php",
  "sh",
  "sql",
  "log"
]);

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/x-ndjson",
  "application/yaml",
  "application/x-yaml",
  "image/svg+xml"
]);

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export type AttachmentRow = {
  id: string;
  user_id?: string;
  bucket_id?: string;
  object_path?: string;
  filename: string;
  content_type: string | null;
  file_size: number;
  extracted_text?: string | null;
  text_preview?: string | null;
  extraction_status?: string | null;
  extraction_error?: string | null;
  created_at: string;
};

export type ExtractionResult = {
  extractedText: string | null;
  textPreview: string | null;
  extractionStatus: "ready" | "unsupported" | "too_large" | "failed";
  extractionError?: string;
};

export function sanitizeAttachmentFilename(name: string): string {
  const fallback = "attachment.txt";
  const clean = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 140);

  return clean || fallback;
}

export function isTextLikeAttachment(filename: string, contentType: string): boolean {
  const normalizedType = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (TEXT_MIME_PREFIXES.some((prefix) => normalizedType.startsWith(prefix))) return true;
  if (TEXT_MIME_TYPES.has(normalizedType)) return true;

  const extension = filename.toLowerCase().split(".").pop();
  return extension ? TEXT_EXTENSIONS.has(extension) : false;
}

export function extractTextFromAttachment(bytes: Buffer, filename: string, contentType: string): ExtractionResult {
  if (!isTextLikeAttachment(filename, contentType)) {
    return {
      extractedText: null,
      textPreview: null,
      extractionStatus: "unsupported",
      extractionError: "Text extraction is not available for this file type yet."
    };
  }

  try {
    const rawText = bytes.toString("utf8");
    const normalized = rawText.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
    const extractedText = normalized.slice(0, MAX_EXTRACTED_TEXT_CHARS);
    const clipped = normalized.length > MAX_EXTRACTED_TEXT_CHARS;

    return {
      extractedText,
      textPreview: extractedText.slice(0, 600),
      extractionStatus: clipped ? "too_large" : "ready",
      extractionError: clipped ? "File text was clipped to the maximum extraction size." : undefined
    };
  } catch (error) {
    return {
      extractedText: null,
      textPreview: null,
      extractionStatus: "failed",
      extractionError: getErrorMessage(error, "Could not extract text from this file.")
    };
  }
}

export function normalizeAttachment(row: AttachmentRow): CouncilAttachment {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type || "application/octet-stream",
    fileSize: Number(row.file_size ?? 0),
    textPreview: row.text_preview ?? undefined,
    extractedText: row.extracted_text ?? undefined,
    extractionStatus: normalizeExtractionStatus(row.extraction_status),
    extractionError: row.extraction_error ?? undefined,
    createdAt: row.created_at
  };
}

export function attachmentDisplaySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function buildAttachmentContext(attachments: CouncilAttachment[]): string {
  if (!attachments.length) return "";

  let remaining = MAX_ATTACHMENT_CONTEXT_CHARS;
  const sections: string[] = [];

  attachments.forEach((attachment, index) => {
    if (remaining <= 0) return;

    const header = `[File ${index + 1}] ${attachment.filename} (${attachment.contentType}, ${attachmentDisplaySize(attachment.fileSize)})`;
    const body = attachment.extractedText?.trim()
      ? attachment.extractedText.trim().slice(0, Math.min(MAX_ATTACHMENT_CONTEXT_CHARS_PER_FILE, remaining))
      : `No extracted text is available. Extraction status: ${attachment.extractionStatus}.`;
    const section = `${header}\n${body}`;
    sections.push(section);
    remaining -= section.length;
  });

  return sections.join("\n\n");
}

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

  const paths = (data ?? []).map((row) => row.object_path as string).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await params.admin.storage.from(ATTACHMENT_BUCKET).remove(paths);
    if (storageError) {
      console.warn("[attachments] could not remove storage objects", storageError);
    }
  }

  const { error: updateError } = await params.admin
    .from("file_attachments")
    .update({
      extracted_text: null,
      text_preview: null,
      extraction_status: "none",
      deleted_at: new Date().toISOString()
    })
    .eq("user_id", params.userId)
    .in("id", uniqueIds);

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

function normalizeExtractionStatus(status: string | null | undefined): CouncilAttachment["extractionStatus"] {
  if (status === "ready" || status === "unsupported" || status === "too_large" || status === "failed" || status === "none") {
    return status;
  }

  return "none";
}
