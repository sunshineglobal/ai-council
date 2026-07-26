import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, parseJsonBody } from "@/lib/api";
import { normalizeEmail, sendMagicLink } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/production-guardrails";
import { clientAddress } from "@/lib/request-security";

const schema = z.object({
  email: z.string().trim().email()
});

export const POST = apiRoute(async (request: Request) => {
  const body = schema.parse(await parseJsonBody(request));
  const email = normalizeEmail(body.email);
  await enforceRateLimit({
    scope: "magic-link-email",
    key: email,
    limit: 5,
    windowSeconds: 15 * 60,
    message: "Too many sign-in requests. Try again later."
  });
  await enforceRateLimit({
    scope: "magic-link-address",
    key: clientAddress(request),
    limit: 20,
    windowSeconds: 15 * 60,
    message: "Too many sign-in requests. Try again later."
  });
  await sendMagicLink(body.email);
  return NextResponse.json({ ok: true });
});
