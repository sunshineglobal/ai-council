"use client";

import type { ChangeEvent, FormEvent, KeyboardEvent, RefObject } from "react";
import { Loader2, Paperclip, Send, Square } from "lucide-react";
import { MAX_PROMPT_CHARACTERS } from "@/lib/limits";
import type { CouncilAttachment } from "@/lib/types";
import { AttachmentList } from "@/components/council-workspace/attachment-list";

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
  onRemoveAttachment,
  onStop,
  onSubmit
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
  onRemoveAttachment: (fileId: string) => void;
  onStop: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form className="composer" aria-busy={uploading} onSubmit={onSubmit}>
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
        maxLength={MAX_PROMPT_CHARACTERS}
        placeholder="Ask the council..."
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
        </div>
        <div className="composer-actions">
          <button
            aria-label={uploading ? "Uploading files" : "Attach files"}
            className="icon-button ghost composer-icon-button"
            disabled={!canAttachMore}
            type="button"
            title={uploading ? "Uploading" : "Attach files"}
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
