import type { CouncilAttachment } from "@/lib/types";

export type AttachmentStorageUsage = {
  usedBytes: number;
  maxBytes: number;
  remainingBytes: number;
  percentUsed: number;
};

export function attachmentStorageUsage(usedBytes: number, maxBytes: number): AttachmentStorageUsage {
  const used = Number.isFinite(usedBytes) ? Math.max(0, Math.floor(usedBytes)) : 0;
  const max = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0;
  return {
    usedBytes: used,
    maxBytes: max,
    remainingBytes: Math.max(0, max - used),
    percentUsed: max <= 0 ? 100 : Math.min(100, (used / max) * 100)
  };
}

export function selectLibraryAttachment(
  current: CouncilAttachment[],
  file: CouncilAttachment,
  maxCount: number
): { attachments: CouncilAttachment[]; error?: string } {
  if (current.some((item) => item.id === file.id)) {
    return { attachments: current.filter((item) => item.id !== file.id) };
  }
  if (current.length >= maxCount) {
    return { attachments: current, error: `Attach at most ${maxCount} files.` };
  }
  return { attachments: [...current, file] };
}
