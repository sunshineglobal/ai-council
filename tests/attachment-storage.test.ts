import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteUserAttachment,
  deleteUserAttachments
} from "@/lib/attachments/storage";

type DeletionKind = "single" | "bulk";

function createQuery(
  result: { data: unknown; error: unknown },
  terminal: "in" | "maybeSingle" = "in"
) {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn()
  };
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);

  if (terminal === "maybeSingle") {
    query.maybeSingle.mockResolvedValue(result);
  } else {
    query.in.mockResolvedValue(result);
  }

  return query;
}

function createLookupQuery(kind: DeletionKind) {
  const target = { id: "file-1", object_path: "user-1/file-1" };
  return createQuery(
    { data: kind === "single" ? target : [target], error: null },
    kind === "single" ? "maybeSingle" : "in"
  );
}

function createAdmin(
  queries: ReturnType<typeof createQuery>[],
  storageResult: { error: unknown } = { error: null }
) {
  const from = vi.fn();
  for (const query of queries) from.mockReturnValueOnce(query);

  const remove = vi.fn().mockResolvedValue(storageResult);
  const storageFrom = vi.fn().mockReturnValue({ remove });

  return {
    admin: { from, storage: { from: storageFrom } } as never,
    from,
    remove
  };
}

function deleteAttachment(kind: DeletionKind, admin: never) {
  if (kind === "single") {
    return deleteUserAttachment({ admin, userId: "user-1", attachmentId: "file-1" });
  }

  return deleteUserAttachments({ admin, userId: "user-1", attachmentIds: ["file-1"] });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attachment deletion error semantics", () => {
  it("treats bulk cleanup lookup failures as best effort", async () => {
    const lookupError = new Error("lookup failed");
    const query = createQuery({ data: null, error: lookupError });
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
    const query = createQuery({ data: null, error: lookupError }, "maybeSingle");

    await expect(
      deleteUserAttachment({
        admin: { from: vi.fn().mockReturnValue(query) } as never,
        userId: "user-1",
        attachmentId: "file-1"
      })
    ).rejects.toBe(lookupError);
  });

  it("returns 404 when the requested attachment does not exist", async () => {
    const query = createQuery({ data: null, error: null }, "maybeSingle");

    await expect(
      deleteUserAttachment({
        admin: { from: vi.fn().mockReturnValue(query) } as never,
        userId: "user-1",
        attachmentId: "file-1"
      })
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "File not found."
    });
  });
});

describe("attachment deletion workflow", () => {
  it.each(["single", "bulk"] as const)(
    "removes storage and clears extracted text for %s deletion",
    async (kind) => {
      const lookupQuery = createLookupQuery(kind);
      const markQuery = createQuery({ data: null, error: null });
      const finalizeQuery = createQuery({ data: null, error: null });
      const { admin, remove } = createAdmin([lookupQuery, markQuery, finalizeQuery]);

      await expect(deleteAttachment(kind, admin)).resolves.toBeUndefined();

      expect(markQuery.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
      expect(remove).toHaveBeenCalledWith(["user-1/file-1"]);
      expect(finalizeQuery.update).toHaveBeenCalledWith({
        extracted_text: null,
        text_preview: null,
        extraction_status: "none"
      });

      const deletedAt = markQuery.update.mock.calls[0]?.[0].deleted_at;
      expect(finalizeQuery.eq).toHaveBeenCalledWith("deleted_at", deletedAt);
      expect(finalizeQuery.in).toHaveBeenCalledWith("id", ["file-1"]);
    }
  );

  it.each(["single", "bulk"] as const)(
    "rolls back the deletion marker when %s storage removal fails",
    async (kind) => {
      const storageError = new Error("storage failed");
      const lookupQuery = createLookupQuery(kind);
      const markQuery = createQuery({ data: null, error: null });
      const rollbackQuery = createQuery({ data: null, error: null });
      const { admin, from } = createAdmin(
        [lookupQuery, markQuery, rollbackQuery],
        { error: storageError }
      );
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const deletion = deleteAttachment(kind, admin);
      if (kind === "single") {
        await expect(deletion).rejects.toThrow("Could not remove file from storage: storage failed");
        expect(warn).not.toHaveBeenCalled();
      } else {
        await expect(deletion).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
          "[attachments] could not remove storage objects",
          storageError
        );
      }

      const deletedAt = markQuery.update.mock.calls[0]?.[0].deleted_at;
      expect(rollbackQuery.update).toHaveBeenCalledWith({ deleted_at: null });
      expect(rollbackQuery.eq).toHaveBeenCalledWith("deleted_at", deletedAt);
      expect(rollbackQuery.in).toHaveBeenCalledWith("id", ["file-1"]);
      expect(from).toHaveBeenCalledTimes(3);
    }
  );

  it("propagates finalization failures for a requested single deletion", async () => {
    const finalizeError = new Error("finalize failed");
    const lookupQuery = createLookupQuery("single");
    const markQuery = createQuery({ data: null, error: null });
    const finalizeQuery = createQuery({ data: null, error: finalizeError });
    const { admin } = createAdmin([lookupQuery, markQuery, finalizeQuery]);

    await expect(deleteAttachment("single", admin)).rejects.toBe(finalizeError);
  });

  it("warns and returns on bulk finalization failures", async () => {
    const finalizeError = new Error("finalize failed");
    const lookupQuery = createLookupQuery("bulk");
    const markQuery = createQuery({ data: null, error: null });
    const finalizeQuery = createQuery({ data: null, error: finalizeError });
    const { admin } = createAdmin([lookupQuery, markQuery, finalizeQuery]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(deleteAttachment("bulk", admin)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "[attachments] could not mark attachments deleted",
      finalizeError
    );
  });
});
