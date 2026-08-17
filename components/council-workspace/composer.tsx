"use client";

import { useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, RefObject } from "react";
import Link from "next/link";
import { Loader2, Paperclip, Send, Square } from "lucide-react";
import { AttachmentList } from "@/components/council-workspace/attachment-list";
import type { BudgetChip } from "@/components/council-workspace/budget-chip";
import { MAX_ATTACHMENT_COUNT, MAX_PROMPT_CHARACTERS } from "@/lib/limits";
import type { CouncilAttachment } from "@/lib/types";

export function Composer({
  prompt,
  promptRef,
  fileInputRef,
  attachments,
  uploadError,
  uploading,
  canAttachMore,
  running,
  stopping,
  canSubmit,
  judgeLabel,
  saveHistory,
  fileAccept,
  onPromptChange,
  onUploadFiles,
  onUploadFileList,
  onRemoveAttachment,
  onStop,
  onSubmit,
  budgetChip
}: {
  prompt: string;
  promptRef: RefObject<HTMLTextAreaElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  attachments: CouncilAttachment[];
  uploadError: string;
  uploading: boolean;
  canAttachMore: boolean;
  running: boolean;
  stopping: boolean;
  canSubmit: boolean;
  judgeLabel: string;
  saveHistory: boolean;
  fileAccept: string;
  onPromptChange: (value: string) => void;
  onUploadFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadFileList: (files: FileList | File[]) => void;
  onRemoveAttachment: (fileId: string) => void;
  onStop: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  budgetChip?: BudgetChip | null;
}) {
  const [dragging, setDragging] = useState(false);
  const nearLimit = prompt.length >= Math.floor(MAX_PROMPT_CHARACTERS * 0.8);
  const attachTitle = !canAttachMore
    ? (running || uploading
      ? "Attachments unavailable while busy"
      : attachments.length >= MAX_ATTACHMENT_COUNT
        ? `Attach at most ${MAX_ATTACHMENT_COUNT} files`
        : "Attachments unavailable")
    : uploading
      ? "Uploading"
      : "Attach files";

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSubmit) event.currentTarget.form?.requestSubmit();
    }
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAttachMore) return;
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    if (!canAttachMore) return;
    if (event.dataTransfer.files?.length) onUploadFileList(event.dataTransfer.files);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files ?? []);
    if (!files.length || !canAttachMore) return;
    event.preventDefault();
    onUploadFileList(files);
  }

  return (
    <form
      className={`composer ${dragging ? "dragging" : ""}`}
      aria-busy={uploading}
      onSubmit={onSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {attachments.length || uploadError ? (
        <div className="composer-attachments">
          {attachments.length ? (
            <AttachmentList attachments={attachments} onRemove={onRemoveAttachment} />
          ) : null}
          {uploadError ? <div className="error-text small" role="alert">{uploadError}</div> : null}
        </div>
      ) : null}
      <label className="sr-only" htmlFor="council-prompt">Ask the council</label>
      <textarea
        id="council-prompt"
        ref={promptRef}
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={handlePromptKeyDown}
        onPaste={handlePaste}
        maxLength={MAX_PROMPT_CHARACTERS}
        placeholder={dragging ? "Drop files to attach…" : "Ask the council..."}
        rows={1}
      />
      <input
        ref={fileInputRef}
        aria-label="Choose files to attach"
        className="sr-only"
        type="file"
        multiple
        accept={fileAccept}
        onChange={onUploadFiles}
      />
      <div className="composer-footer">
        <div className="composer-meta" aria-live="polite">
          <span>{judgeLabel}</span>
          <span>{saveHistory ? "Saved" : "Ephemeral"}</span>
          {attachments.length ? <span>{attachments.length} attached</span> : null}
          {uploading ? <span>Uploading</span> : null}
          {nearLimit ? (
            <span className={prompt.length >= MAX_PROMPT_CHARACTERS ? "composer-limit-hit" : undefined}>
              {prompt.length.toLocaleString()}/{MAX_PROMPT_CHARACTERS.toLocaleString()}
            </span>
          ) : null}
          {budgetChip ? (
            <Link
              className={`composer-budget budget-${budgetChip.status}`}
              href={budgetChip.href}
              title="Open usage"
            >
              {budgetChip.label}
            </Link>
          ) : null}
        </div>
        <div className="composer-actions">
          <button
            aria-label={uploading ? "Uploading files" : "Attach files"}
            className="icon-button ghost composer-icon-button"
            disabled={!canAttachMore}
            type="button"
            title={attachTitle}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 aria-hidden className="spin" size={17} />
            ) : (
              <Paperclip aria-hidden size={17} />
            )}
          </button>
          {running ? (
            <button
              aria-label={stopping ? "Stopping council run" : "Stop council run"}
              className="send-button stop-button"
              disabled={stopping}
              type="button"
              title={stopping ? "Stopping" : "Stop"}
              onClick={onStop}
            >
              {stopping ? (
                <Loader2 aria-hidden className="spin" size={17} />
              ) : (
                <Square aria-hidden size={16} />
              )}
            </button>
          ) : (
            <button
              aria-label="Send to council"
              className="send-button"
              disabled={!canSubmit}
              type="submit"
              title="Send"
            >
              <Send aria-hidden size={17} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
