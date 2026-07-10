import { FileText, X } from "lucide-react";
import type { CouncilAttachment } from "@/lib/types";
import { formatBytes } from "@/components/council-workspace/result-utils";

export function AttachmentList({
  attachments,
  onRemove
}: {
  attachments: CouncilAttachment[];
  onRemove?: (fileId: string) => void;
}) {
  return (
    <div className="attachment-list" aria-label="Attached files">
      {attachments.map((attachment) => (
        <div className="attachment-item" key={attachment.id}>
          <FileText aria-hidden size={15} />
          <span className="attachment-copy">
            <strong>{attachment.filename}</strong>
            <span>
              {formatBytes(attachment.fileSize)}
              {attachment.extractionStatus === "ready" || attachment.extractionStatus === "too_large"
                ? " text"
                : ` ${attachment.extractionStatus}`}
            </span>
          </span>
          {onRemove ? (
            <button
              aria-label={`Remove ${attachment.filename}`}
              className="icon-button ghost attachment-remove"
              type="button"
              title={`Remove ${attachment.filename}`}
              onClick={() => onRemove(attachment.id)}
            >
              <X aria-hidden size={14} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
