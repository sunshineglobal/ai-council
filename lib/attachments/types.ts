export type AttachmentRow = {
  id: string;
  user_id?: string;
  bucket_id?: string;
  object_path?: string;
  filename: string;
  content_type: string | null;
  file_size: number;
  extracted_text?: string | null;
  text_preview?: string | null;
  extraction_status?: string | null;
  extraction_error?: string | null;
  created_at: string;
  saved_mode?: boolean;
};

export type ExtractionResult = {
  extractedText: string | null;
  textPreview: string | null;
  extractionStatus: "ready" | "unsupported" | "too_large" | "failed";
  extractionError?: string;
};
