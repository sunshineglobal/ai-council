import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { runEval } from "@/lib/evals/service";
import { evalRunSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = apiRoute(async (request: Request) => {
  const profile = await requireApiProfile();
  const input = evalRunSchema.parse(await request.json());
  return NextResponse.json(await runEval({ profile, input, signal: request.signal }));
});
