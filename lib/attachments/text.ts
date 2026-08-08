import { getErrorMessage } from "@/lib/errors";
import {
  MAX_ATTACHMENT_CONTEXT_CHARS,
  MAX_ATTACHMENT_CONTEXT_CHARS_PER_FILE,
  MAX_EXTRACTED_TEXT_CHARS
} from "@/lib/attachments/constants";
import type { AttachmentRow, ExtractionResult } from "@/lib/attachments/types";
import type { CouncilAttachment } from "@/lib/types";

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
  "application/x-yaml"
]);

export function sanitizeAttachmentFilename(name: string): string {
  const fallback = "attachment.txt";
  const clean = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 140);

  return clean || fallback;
}

export function buildContentDisposition(filename: string): string {
  const sanitized = sanitizeAttachmentFilename(filename)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/"/g, "");
  const ascii = sanitized || "attachment.txt";
  const utf8Name = encodeURIComponent(filename.normalize("NFC"))
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8Name}`;
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

export function toPublicAttachment(attachment: CouncilAttachment): Omit<CouncilAttachment, "extractedText"> {
  const { extractedText: _extractedText, ...publicAttachment } = attachment;
  return publicAttachment;
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
    const separatorLength = sections.length ? 2 : 0;
    const header = `[File ${index + 1}] ${attachment.filename} (${attachment.contentType}, ${attachmentDisplaySize(attachment.fileSize)})`;
    const bodyBudget = remaining - separatorLength - header.length - 1;
    if (bodyBudget <= 0) return;

    const availableBody = attachment.extractedText?.trim()
      ? attachment.extractedText.trim()
      : `No extracted text is available. Extraction status: ${attachment.extractionStatus}.`;
    const body = availableBody.slice(0, Math.min(MAX_ATTACHMENT_CONTEXT_CHARS_PER_FILE, bodyBudget));
    const section = `${header}\n${body}`;
    sections.push(section);
    remaining -= separatorLength + section.length;
  });

  return sections.join("\n\n");
}

function normalizeExtractionStatus(status: string | null | undefined): CouncilAttachment["extractionStatus"] {
  if (status === "ready" || status === "unsupported" || status === "too_large" || status === "failed" || status === "none") {
    return status;
  }

  return "none";
}
