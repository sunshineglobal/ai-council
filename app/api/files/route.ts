import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import {
  listUserAttachments,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_REQUEST_BYTES,
  toPublicAttachment,
  uploadUserAttachments
} from "@/lib/attachments";
import { ApiError } from "@/lib/api-error";
import { requireApiProfile } from "@/lib/auth";
import {
  acquireOperationLease,
  assertAttachmentQuota,
  enforceRateLimit
} from "@/lib/production-guardrails";
import { assertRequestSize } from "@/lib/request-security";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export const GET = apiRoute(async () => {
  const profile = await requireApiProfile();
  const files = await listUserAttachments(createSupabaseAdminClient(), profile.id);
  return NextResponse.json({ files: files.map(toPublicAttachment) });
});

export const POST = apiRoute(async (request: Request) => {
  assertRequestSize(request, MAX_ATTACHMENT_REQUEST_BYTES);
  const profile = await requireApiProfile();
  await enforceRateLimit({
    scope: "attachment-upload",
    key: profile.id,
    limit: 30,
    windowSeconds: 60 * 60,
    message: "Attachment upload limit reached. Try again later."
  });
  const lease = await acquireOperationLease({
    scope: "attachment-upload",
    key: profile.id,
    ttlSeconds: 2 * 60,
    conflictMessage: "Another attachment upload is already in progress."
  });

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter(isFile);
    const incomingBytes = files.reduce((total, file) => total + file.size, 0);
    if (incomingBytes > MAX_ATTACHMENT_BYTES) {
      throw new ApiError(413, "Attachments exceed the combined 4 MB upload limit.");
    }
    await assertAttachmentQuota(profile.id, incomingBytes);
    const uploaded = await uploadUserAttachments({
      admin: createSupabaseAdminClient(),
      userId: profile.id,
      files,
      saveHistory: formData.get("saveHistory") !== "false"
    });
    return NextResponse.json({ files: uploaded.map(toPublicAttachment) });
  } finally {
    await lease.release();
  }
});

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value && "size" in value;
}
