"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { readResponseError } from "@/components/council-workspace/request-utils";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments/constants";
import {
  attachmentStorageUsage,
  selectLibraryAttachment,
  type AttachmentStorageUsage
} from "@/lib/attachments/quota";
import { requestJson } from "@/lib/client-api";
import { MAX_ATTACHMENT_COUNT } from "@/lib/limits";
import type { CouncilAttachment } from "@/lib/types";

type FilesResponse = {
  files: CouncilAttachment[];
  storage?: AttachmentStorageUsage;
};

export function useAttachments(refreshKey?: string | null) {
  const [attachments, setAttachments] = useState<CouncilAttachment[]>([]);
  const [library, setLibrary] = useState<CouncilAttachment[]>([]);
  const [storage, setStorage] = useState<AttachmentStorageUsage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [libraryVersion, setLibraryVersion] = useState(0);

  const refreshLibrary = useCallback(() => {
    setLibraryVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void requestJson<FilesResponse>("/api/files", { signal: controller.signal })
      .then((body) => {
        setLibrary(body.files);
        if (body.storage) setStorage(body.storage);
        setLibraryError("");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setLibraryError(error instanceof Error ? error.message : "Could not load files.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLibraryLoading(false);
      });

    return () => controller.abort();
  }, [libraryVersion, refreshKey]);

  const uploadSelectedFiles = useCallback(async (
    selectedFiles: File[],
    saveHistory: boolean
  ) => {
    if (!selectedFiles.length) return;
    if (attachments.length + selectedFiles.length > MAX_ATTACHMENT_COUNT) {
      setUploadError(`Attach at most ${MAX_ATTACHMENT_COUNT} files.`);
      return;
    }
    if (selectedFiles.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENT_BYTES) {
      setUploadError("Selected files exceed the combined 4 MB upload limit.");
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
      const body = (await response.json()) as FilesResponse;
      setAttachments((current) => [...current, ...body.files].slice(0, MAX_ATTACHMENT_COUNT));
      setLibrary((current) => mergeLibraryFiles(body.files, current));
      if (body.storage) setStorage(body.storage);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "File upload failed.");
    } finally {
      setUploading(false);
    }
  }, [attachments.length]);

  const uploadFiles = useCallback(async (
    event: ChangeEvent<HTMLInputElement>,
    saveHistory: boolean
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    await uploadSelectedFiles(selectedFiles, saveHistory);
  }, [uploadSelectedFiles]);

  const uploadFileList = useCallback(async (
    files: FileList | File[],
    saveHistory: boolean
  ) => {
    await uploadSelectedFiles(Array.from(files), saveHistory);
  }, [uploadSelectedFiles]);

  const attachFromLibrary = useCallback((file: CouncilAttachment) => {
    const next = selectLibraryAttachment(attachments, file, MAX_ATTACHMENT_COUNT);
    setAttachments(next.attachments);
    setUploadError(next.error ?? "");
  }, [attachments]);

  const removeAttachment = useCallback((fileId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== fileId));
    setUploadError("");
  }, []);

  const deleteLibraryFile = useCallback(async (fileId: string) => {
    const removedFromRun = attachments.find((attachment) => attachment.id === fileId);
    const removedFromLibrary = library.find((attachment) => attachment.id === fileId);
    setAttachments((current) => current.filter((attachment) => attachment.id !== fileId));
    setLibrary((current) => current.filter((attachment) => attachment.id !== fileId));
    setUploadError("");
    if (removedFromLibrary && storage) {
      setStorage(attachmentStorageUsage(storage.usedBytes - removedFromLibrary.fileSize, storage.maxBytes));
    }

    try {
      await requestJson<{ ok: true }>(`/api/files/${fileId}`, { method: "DELETE" });
      refreshLibrary();
    } catch (error) {
      if (removedFromRun) setAttachments((current) => [...current, removedFromRun]);
      if (removedFromLibrary) setLibrary((current) => mergeLibraryFiles([removedFromLibrary], current));
      refreshLibrary();
      setUploadError(error instanceof Error ? error.message : "Could not remove file.");
    }
  }, [attachments, library, refreshLibrary, storage]);

  const clearAttachments = useCallback(() => setAttachments([]), []);
  const clearUploadError = useCallback(() => setUploadError(""), []);

  return {
    attachments,
    library,
    storage,
    uploading,
    libraryLoading,
    uploadError,
    libraryError,
    uploadFiles,
    uploadFileList,
    attachFromLibrary,
    removeAttachment,
    deleteLibraryFile,
    clearAttachments,
    clearUploadError
  };
}

function mergeLibraryFiles(incoming: CouncilAttachment[], current: CouncilAttachment[]): CouncilAttachment[] {
  const seen = new Set(incoming.map((file) => file.id));
  return [...incoming, ...current.filter((file) => !seen.has(file.id))];
}
