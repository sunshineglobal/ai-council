import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { buildAttachmentContext, extractTextFromAttachment, sanitizeAttachmentFilename } from "@/lib/attachments";
import type { CouncilAttachment } from "@/lib/types";

describe("attachment helpers", () => {
  it("sanitizes unsafe filenames", () => {
    expect(sanitizeAttachmentFilename("../notes:plan?.md")).toBe("..-notes-plan-.md");
    expect(sanitizeAttachmentFilename("   ")).toBe("attachment.txt");
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
