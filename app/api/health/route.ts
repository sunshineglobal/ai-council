import { validateProductionConfig } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { logEvent } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  const config = validateProductionConfig();
  let database = false;
  let databaseError: string | undefined;

  if (config.valid) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const { error } = await createSupabaseAdminClient()
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .abortSignal(controller.signal);
      if (error) throw error;
      database = true;
    } catch (error) {
      databaseError = getErrorMessage(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  const ready = config.valid && database;
  logEvent(ready ? "info" : "warn", "Health check completed", {
    ready,
    configValid: config.valid,
    database,
    durationMs: Date.now() - started,
    databaseError
  });

  return Response.json(
    {
      status: ready ? "ok" : "unavailable",
      checks: {
        configuration: config.valid,
        database
      },
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "unknown"
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
