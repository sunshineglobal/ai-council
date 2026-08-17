import { describe, expect, it } from "vitest";
import { storageChipFromUsage } from "@/components/council-workspace/storage-chip";
import { attachmentStorageUsage } from "@/lib/attachments";

describe("workspace storage chip", () => {
  it("shows used storage against the quota", () => {
    expect(storageChipFromUsage(attachmentStorageUsage(12 * 1024 * 1024, 100 * 1024 * 1024))).toEqual({
      label: "12 MB of 100 MB",
      status: "ok"
    });
  });

  it("warns when storage is nearly full", () => {
    expect(storageChipFromUsage(attachmentStorageUsage(82 * 1024 * 1024, 100 * 1024 * 1024)).status)
      .toBe("warning");
  });

  it("flags a full quota", () => {
    expect(storageChipFromUsage(attachmentStorageUsage(100 * 1024 * 1024, 100 * 1024 * 1024))).toEqual({
      label: "Storage full",
      status: "over"
    });
  });
});
