import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { listEvalRunsForUser } from "@/lib/evals/repository";

export const GET = apiRoute(async () => {
  const profile = await requireApiProfile();
  return NextResponse.json({ evals: await listEvalRunsForUser(profile.id) });
});
