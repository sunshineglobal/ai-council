"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Download, Eye, FileText, X } from "lucide-react";
import type { CouncilAttachment } from "@/lib/types";
import { formatBytes } from "@/components/council-workspace/result-utils";
import { requestJson } from "@/lib/client-api";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function extractionLabel(attachment: CouncilAttachment): string {
  switch (attachment.extractionStatus) {
    case "ready":
      return "text ready";
    case "too_large":
      return "text truncated";
    case "unsupported":
      return "unsupported";
    case "failed":
      return attachment.extractionError || "extract failed";
    default:
      return attachment.extractionStatus;
  }
}

export function AttachmentList({
  attachments,
  onRemove
}: {
  attachments: CouncilAttachment[];
  onRemove?: (fileId: string) => void;
}) {
  const [preview, setPreview] = useState<CouncilAttachment | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previewOpen = Boolean(preview || previewError);

  useEffect(() => {
    if (!previewOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, [previewOpen]);

  function closePreview() {
    setPreview(null);
    setPreviewError("");
  }

  function handlePreviewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePreview();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function openPreview(attachment: CouncilAttachment) {
    if (attachment.textPreview) {
      setPreview(attachment);
      setPreviewError("");
      return;
    }

    setPreviewLoadingId(attachment.id);
    setPreviewError("");
    try {
      const body = await requestJson<{ file: CouncilAttachment }>(`/api/files/${attachment.id}?mode=preview`);
      setPreview(body.file);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Could not load preview.");
      setPreview(attachment);
    } finally {
      setPreviewLoadingId(null);
    }
  }

  return (
    <>
      <div className="attachment-list" aria-label="Attached files">
        {attachments.map((attachment) => (
          <div className="attachment-item" key={attachment.id}>
            <FileText aria-hidden size={15} />
            <span className="attachment-copy">
              <strong>{attachment.filename}</strong>
              <span>
                {formatBytes(attachment.fileSize)} · {extractionLabel(attachment)}
              </span>
            </span>
            <div className="attachment-actions">
              <button
                aria-label={`Preview ${attachment.filename}`}
                className="icon-button ghost attachment-action"
                type="button"
                title={`Preview ${attachment.filename}`}
                onClick={() => void openPreview(attachment)}
              >
                <Eye aria-hidden size={14} />
              </button>
              <a
                aria-label={`Download ${attachment.filename}`}
                className="icon-button ghost attachment-action"
                href={`/api/files/${attachment.id}`}
                download={attachment.filename}
                title={`Download ${attachment.filename}`}
              >
                <Download aria-hidden size={14} />
              </a>
              {onRemove ? (
                <button
                  aria-label={`Remove ${attachment.filename}`}
                  className="icon-button ghost attachment-remove"
                  type="button"
                  title={`Remove ${attachment.filename} from this run`}
                  onClick={() => onRemove(attachment.id)}
                >
                  <X aria-hidden size={14} />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {previewOpen ? (
        <div className="attachment-preview-layer">
          <button
            aria-label="Close preview"
            className="drawer-scrim"
            type="button"
            onClick={closePreview}
          />
          <div
            ref={panelRef}
            className="attachment-preview-panel panel stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attachment-preview-title"
            onKeyDown={handlePreviewKeyDown}
          >
            <div className="section-title">
              <h3 id="attachment-preview-title">{preview?.filename ?? "Preview"}</h3>
              <button
                ref={closeButtonRef}
                className="icon-button ghost"
                type="button"
                aria-label="Close preview"
                onClick={closePreview}
              >
                <X aria-hidden size={16} />
              </button>
            </div>
            {previewLoadingId ? <p className="muted small" role="status">Loading preview…</p> : null}
            {previewError ? <p className="error-text" role="alert">{previewError}</p> : null}
            {preview?.textPreview ? (
              <pre className="attachment-preview-body">{preview.textPreview}</pre>
            ) : !previewLoadingId ? (
              <p className="muted small">No text preview is available for this file.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
