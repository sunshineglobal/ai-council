import type { AttachmentStorageUsage } from "@/lib/attachments/quota";
import { attachmentDisplaySize } from "@/lib/attachments/text";

export type StorageChipStatus = "ok" | "warning" | "over";

export type StorageChip = {
  label: string;
  status: StorageChipStatus;
};

export function storageChipFromUsage(storage: AttachmentStorageUsage): StorageChip {
  if (storage.maxBytes <= 0 || storage.percentUsed >= 100) {
    return { label: "Storage full", status: "over" };
  }

  return {
    label: `${attachmentDisplaySize(storage.usedBytes)} of ${attachmentDisplaySize(storage.maxBytes)}`,
    status: storage.percentUsed >= 80 ? "warning" : "ok"
  };
}
