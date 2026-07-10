import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { listUserAttachments, toPublicAttachment, uploadUserAttachments } from "@/lib/attachments";
import { requireApiProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export const GET = apiRoute(async () => {
  const profile = await requireApiProfile();
  const files = await listUserAttachments(createSupabaseAdminClient(), profile.id);
  return NextResponse.json({ files: files.map(toPublicAttachment) });
});

export const POST = apiRoute(async (request: Request) => {
  const profile = await requireApiProfile();
  const formData = await request.formData();
  const files = formData.getAll("files").filter(isFile);
  const uploaded = await uploadUserAttachments({
    admin: createSupabaseAdminClient(),
    userId: profile.id,
    files,
    saveHistory: formData.get("saveHistory") !== "false"
  });
  return NextResponse.json({ files: uploaded.map(toPublicAttachment) });
});

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value && "size" in value;
}
