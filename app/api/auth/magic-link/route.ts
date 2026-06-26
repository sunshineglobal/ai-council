import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { sendMagicLink } from "@/lib/auth";

const schema = z.object({
  email: z.string().email()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    await sendMagicLink(body.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
