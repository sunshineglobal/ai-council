import { NextResponse } from "next/server";
import { apiRoute, parseJsonBody } from "@/lib/api";
import { requireApiProfile, updateDefaultSaveHistory } from "@/lib/auth";
import { profilePreferencesSchema } from "@/lib/validation";

export const PATCH = apiRoute(async (request: Request) => {
  const profile = await requireApiProfile();
  const body = profilePreferencesSchema.parse(await parseJsonBody(request));
  const defaultSaveHistory = await updateDefaultSaveHistory(profile.id, body.defaultSaveHistory);
  return NextResponse.json({ defaultSaveHistory });
});
