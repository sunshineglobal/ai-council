import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { searchWithFirecrawl } from "@/lib/firecrawl";
import { researchSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await requireApiProfile();
    const body = researchSchema.parse(await request.json());
    const research = await searchWithFirecrawl(body.query, body.limit ?? 5);
    return NextResponse.json({ research });
  } catch (error) {
    return jsonError(error);
  }
}
