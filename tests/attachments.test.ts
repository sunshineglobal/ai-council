import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  buildAttachmentContext,
  buildContentDisposition,
  extractTextFromAttachment,
  MAX_ATTACHMENT_CONTEXT_CHARS,
  sanitizeAttachmentFilename
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
