import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteUserAttachment,
  deleteUserAttachments
} from "@/lib/attachments/storage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attachment deletion error semantics", () => {
  it("treats bulk cleanup lookup failures as best effort", async () => {
    const lookupError = new Error("lookup failed");
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      in: vi.fn()
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.in.mockResolvedValue({ data: null, error: lookupError });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      deleteUserAttachments({
        admin: { from: vi.fn().mockReturnValue(query) } as never,
        userId: "user-1",
        attachmentIds: ["file-1"]
      })
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith("[attachments] could not load attachments for cleanup", lookupError);
  });

  it("propagates lookup failures for a requested single deletion", async () => {
    const lookupError = new Error("lookup failed");
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn()
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: lookupError });

    await expect(
      deleteUserAttachment({
        admin: { from: vi.fn().mockReturnValue(query) } as never,
        userId: "user-1",
        attachmentId: "file-1"
      })
    ).rejects.toBe(lookupError);
  });
});
