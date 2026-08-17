import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  attachmentStorageUsage,
  buildAttachmentContext,
  buildContentDisposition,
  extractTextFromAttachment,
  MAX_ATTACHMENT_CONTEXT_CHARS,
  normalizeAttachment,
  sanitizeAttachmentFilename,
  selectLibraryAttachment
} from "@/lib/attachments";
import type { CouncilAttachment } from "@/lib/types";

describe("attachment helpers", () => {
  it("sanitizes unsafe filenames", () => {
    expect(sanitizeAttachmentFilename("../notes:plan?.md")).toBe("..-notes-plan-.md");
    expect(sanitizeAttachmentFilename("   ")).toBe("attachment.txt");
  });

  it("builds a single-line content disposition header", () => {
    const header = buildContentDisposition('report\r\n"quoted".md');
    expect(header.includes("\n")).toBe(false);
    expect(header.includes("\r")).toBe(false);
    expect(header).toContain('filename="');
    expect(header).toContain("filename*=UTF-8''");
    expect(buildContentDisposition("メモ.md")).toContain("filename*=UTF-8''");
  });

  it("extracts text-like files", () => {
    const result = extractTextFromAttachment(Buffer.from("hello\r\nworld"), "notes.md", "text/markdown");

    expect(result.extractionStatus).toBe("ready");
    expect(result.extractedText).toBe("hello\nworld");
    expect(result.textPreview).toBe("hello\nworld");
  });

  it("marks unsupported binary files without extracted text", () => {
    const result = extractTextFromAttachment(Buffer.from("%PDF"), "paper.pdf", "application/pdf");

    expect(result.extractionStatus).toBe("unsupported");
    expect(result.extractedText).toBeNull();
  });

  it("builds attachment context without exposing empty content as text", () => {
    const context = buildAttachmentContext([
      attachment({
        filename: "notes.md",
        extractedText: "Important context",
        extractionStatus: "ready"
      }),
      attachment({
        filename: "paper.pdf",
        extractionStatus: "unsupported"
      })
    ]);

    expect(context).toContain("[File 1] notes.md");
    expect(context).toContain("Important context");
    expect(context).toContain("Extraction status: unsupported");
  });

  it("keeps the complete attachment context within its character budget", () => {
    const context = buildAttachmentContext(
      Array.from({ length: 5 }, (_, index) => attachment({
        filename: `large-${index}.txt`,
        extractedText: "x".repeat(MAX_ATTACHMENT_CONTEXT_CHARS),
        fileSize: MAX_ATTACHMENT_CONTEXT_CHARS
      }))
    );

    expect(context.length).toBeLessThanOrEqual(MAX_ATTACHMENT_CONTEXT_CHARS);
  });

  it("treats missing saved_mode as saved and honors false", () => {
    expect(normalizeAttachment({
      id: "file-1",
      filename: "notes.md",
      content_type: "text/markdown",
      file_size: 12,
      created_at: new Date(0).toISOString()
    }).savedMode).toBe(true);

    expect(normalizeAttachment({
      id: "file-2",
      filename: "scratch.md",
      content_type: "text/markdown",
      file_size: 12,
      created_at: new Date(0).toISOString(),
      saved_mode: false
    }).savedMode).toBe(false);
  });

  it("toggles a library file onto the run and respects the per-run limit", () => {
    const first = attachment({ id: "a", filename: "a.md" });
    const second = attachment({ id: "b", filename: "b.md" });

    expect(selectLibraryAttachment([], first, 2).attachments).toEqual([first]);
    expect(selectLibraryAttachment([first], first, 2).attachments).toEqual([]);
    expect(selectLibraryAttachment([first], second, 1)).toEqual({
      attachments: [first],
      error: "Attach at most 1 files."
    });
  });

  it("computes remaining attachment storage without going negative", () => {
    expect(attachmentStorageUsage(25 * 1024 * 1024, 100 * 1024 * 1024)).toEqual({
      usedBytes: 25 * 1024 * 1024,
      maxBytes: 100 * 1024 * 1024,
      remainingBytes: 75 * 1024 * 1024,
      percentUsed: 25
    });
    expect(attachmentStorageUsage(120, 100).remainingBytes).toBe(0);
    expect(attachmentStorageUsage(-8, 100).usedBytes).toBe(0);
  });
});

function attachment(overrides: Partial<CouncilAttachment>): CouncilAttachment {
  return {
    id: crypto.randomUUID(),
    filename: "file.txt",
    contentType: "text/plain",
    fileSize: 12,
    extractionStatus: "ready",
    createdAt: new Date(0).toISOString(),
    ...overrides
  };
}
