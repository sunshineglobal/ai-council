import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { requireApiProfile } from "@/lib/auth";
import { searchWithFirecrawl } from "@/lib/firecrawl";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import { researchSchema } from "@/lib/validation";

const researchLimiter = new FixedWindowRateLimiter(20, 60 * 1000);

export const POST = apiRoute(async (request: Request) => {
  const profile = await requireApiProfile();
  const rateLimit = researchLimiter.consume(profile.id);
  if (!rateLimit.allowed) {
    throw new ApiError(429, `Research rate limit reached. Try again in ${rateLimit.retryAfterSeconds} seconds.`);
  }
  const body = researchSchema.parse(await request.json());
  const research = await searchWithFirecrawl(body.query, body.limit, request.signal, profile.id);
  return NextResponse.json({ research });
});
