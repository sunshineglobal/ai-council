import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import {
  buildContentDisposition,
  deleteUserAttachment,
  getUserAttachmentDownload,
  getUserAttachmentPreview,
  toPublicAttachment
} from "@/lib/attachments";
import { requireApiProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export const GET = apiRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireApiProfile();
  const { id } = await params;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const admin = createSupabaseAdminClient();

  if (mode === "preview") {
    const preview = await getUserAttachmentPreview(admin, profile.id, id);
    return NextResponse.json({ file: toPublicAttachment(preview) });
  }

  const file = await getUserAttachmentDownload(admin, profile.id, id);
  const bytes = new Uint8Array(await file.body.arrayBuffer());
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": buildContentDisposition(file.filename),
      "Cache-Control": "private, no-store"
    }
  });
});

export const DELETE = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await requireApiProfile();
  const { id } = await params;
  await deleteUserAttachment({
    admin: createSupabaseAdminClient(),
    userId: profile.id,
    attachmentId: id
  });
  return NextResponse.json({ ok: true });
});
