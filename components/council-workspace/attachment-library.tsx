"use client";

import { Check, FolderOpen, Trash2 } from "lucide-react";
import { formatBytes } from "@/components/council-workspace/result-utils";
import type { StorageChip } from "@/components/council-workspace/storage-chip";
import type { CouncilAttachment } from "@/lib/types";

export function AttachmentLibrary({
  files,
  selectedIds,
  storageChip,
  loading,
  error,
  deleting,
  canAttachMore,
  onAttach,
  onDelete
}: {
  files: CouncilAttachment[];
  selectedIds: Set<string>;
  storageChip: StorageChip | null;
  loading: boolean;
  error: string;
  deleting: boolean;
  canAttachMore: boolean;
  onAttach: (file: CouncilAttachment) => void;
  onDelete: (fileId: string) => void;
}) {
  return (
    <div className="attachment-library" aria-label="File library">
      <div className="attachment-library-header">
        <span className="attachment-library-title">
          <FolderOpen aria-hidden size={14} />
          Files
        </span>
        {storageChip ? (
          <span className={`attachment-library-quota storage-${storageChip.status}`}>
            {storageChip.label}
          </span>
        ) : null}
      </div>
      {loading ? <p className="muted small" role="status">Loading files…</p> : null}
      {error ? <p className="error-text small" role="alert">{error}</p> : null}
      {!loading && !files.length && !error ? (
        <p className="muted small">
          Uploaded files stay here so you can reuse them. Delete leftovers to free storage.
        </p>
      ) : null}
      {files.length ? (
        <ul className="attachment-library-list">
          {files.map((file) => {
            const selected = selectedIds.has(file.id);
            return (
              <li className="attachment-library-item" key={file.id}>
                <button
                  className="attachment-library-pick"
                  type="button"
                  disabled={!selected && !canAttachMore}
                  title={selected ? `Remove ${file.filename} from this run` : `Attach ${file.filename}`}
                  onClick={() => onAttach(file)}
                >
                  <span className="attachment-copy">
                    <strong>{file.filename}</strong>
                    <span>
                      {formatBytes(file.fileSize)} · {file.savedMode === false ? "Expires" : "Saved"}
                    </span>
                  </span>
                  {selected ? (
                    <span className="attachment-library-state">
                      <Check aria-hidden size={14} />
                      Attached
                    </span>
                  ) : null}
                </button>
                <button
                  aria-label={`Delete ${file.filename} from library`}
                  className="icon-button ghost attachment-remove"
                  disabled={deleting}
                  type="button"
                  title={`Delete ${file.filename}`}
                  onClick={() => onDelete(file.id)}
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
