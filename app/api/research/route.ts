import { NextResponse } from "next/server";
import { apiRoute, parseJsonBody } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { searchWithFirecrawl } from "@/lib/firecrawl";
import { assertResearchAvailable, enforceRateLimit } from "@/lib/production-guardrails";
import { researchSchema } from "@/lib/validation";

export const POST = apiRoute(async (request: Request) => {
  const profile = await requireApiProfile();
  assertResearchAvailable();
  await enforceRateLimit({
    scope: "research",
    key: profile.id,
    limit: 10,
    windowSeconds: 60 * 60,
    message: "Research limit reached. Try again later."
  });
  const body = researchSchema.parse(await parseJsonBody(request));
  const research = await searchWithFirecrawl(body.query, body.limit, request.signal, profile.id);
  return NextResponse.json({ research });
});
