import { getEnv } from "@/lib/env";
import { runProductionMaintenance } from "@/lib/maintenance";
import { logEvent, reportError } from "@/lib/observability";
import { bearerTokenMatches } from "@/lib/request-security";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const started = Date.now();
  if (!bearerTokenMatches(request, getEnv("CRON_SECRET"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runProductionMaintenance();
    logEvent("info", "Production maintenance completed", {
      ...result,
      durationMs: Date.now() - started
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    await reportError(error, {
      route: "/api/cron/maintenance",
      durationMs: Date.now() - started
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}
