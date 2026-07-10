"use client";

import { useCallback, useState } from "react";
import type { ChangeEvent } from "react";
import { readResponseError } from "@/components/council-workspace/request-utils";
import { requestJson } from "@/lib/client-api";
import { MAX_ATTACHMENT_COUNT } from "@/lib/limits";
import type { CouncilAttachment } from "@/lib/types";

export function useAttachments() {
  const [attachments, setAttachments] = useState<CouncilAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const uploadFiles = useCallback(async (
    event: ChangeEvent<HTMLInputElement>,
    saveHistory: boolean
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selectedFiles.length) return;
    if (attachments.length + selectedFiles.length > MAX_ATTACHMENT_COUNT) {
      setUploadError(`Attach at most ${MAX_ATTACHMENT_COUNT} files.`);
      return;
    }

    setUploading(true);
    setUploadError("");
    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append("files", file));
    formData.append("saveHistory", String(saveHistory));

    try {
      const response = await fetch("/api/files", { method: "POST", body: formData });
      if (!response.ok) throw new Error(await readResponseError(response, "File upload failed"));
      const body = (await response.json()) as { files: CouncilAttachment[] };
      setAttachments((current) => [...current, ...body.files].slice(0, MAX_ATTACHMENT_COUNT));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "File upload failed.");
    } finally {
      setUploading(false);
    }
  }, [attachments.length]);

  const removeAttachment = useCallback(async (fileId: string) => {
    const removed = attachments.find((attachment) => attachment.id === fileId);
    setAttachments((current) => current.filter((attachment) => attachment.id !== fileId));
    setUploadError("");

    try {
      await requestJson<{ ok: true }>(`/api/files/${fileId}`, { method: "DELETE" });
    } catch (error) {
      if (removed) setAttachments((current) => [...current, removed]);
      setUploadError(error instanceof Error ? error.message : "Could not remove file.");
    }
  }, [attachments]);

  const clearAttachments = useCallback(() => setAttachments([]), []);
  const clearUploadError = useCallback(() => setUploadError(""), []);

  return {
    attachments,
    uploading,
    uploadError,
    uploadFiles,
    removeAttachment,
    clearAttachments,
    clearUploadError
  };
}
