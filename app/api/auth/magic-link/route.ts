import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { normalizeEmail, sendMagicLink } from "@/lib/auth";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email()
});

const magicLinkLimiter = new FixedWindowRateLimiter(5, 15 * 60 * 1000);

export const POST = apiRoute(async (request: Request) => {
  const body = schema.parse(await request.json());
  const rateLimit = magicLinkLimiter.consume(normalizeEmail(body.email));
  if (!rateLimit.allowed) {
    throw new ApiError(429, `Too many sign-in requests. Try again in ${rateLimit.retryAfterSeconds} seconds.`);
  }
  await sendMagicLink(body.email);
  return NextResponse.json({ ok: true });
});
