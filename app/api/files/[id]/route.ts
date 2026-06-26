import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { ATTACHMENT_BUCKET } from "@/lib/attachments";
import { ApiError, requireApiProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await requireApiProfile();
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
      .from("file_attachments")
      .select("id,object_path")
      .eq("id", id)
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new ApiError(404, "File not found.");

    const objectPath = data.object_path as string;
    if (objectPath) {
      const { error: storageError } = await admin.storage.from(ATTACHMENT_BUCKET).remove([objectPath]);
      if (storageError) throw new Error(`Could not remove file from storage: ${storageError.message}`);
    }

    const { error: updateError } = await admin
      .from("file_attachments")
      .update({
        extracted_text: null,
        text_preview: null,
        extraction_status: "none",
        deleted_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("user_id", profile.id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
