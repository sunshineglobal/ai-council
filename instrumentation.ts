import { validateProductionConfig } from "@/lib/env";
import { logEvent } from "@/lib/observability";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const productionRuntime =
    process.env.VERCEL_ENV === "production" ||
    process.env.REQUIRE_PRODUCTION_ENV === "true";
  if (!productionRuntime) return;

  const config = validateProductionConfig();
  if (!config.valid) {
    logEvent("error", "Production configuration validation failed", {
      issues: config.issues
    });
    throw new Error(`Invalid production configuration: ${config.issues.join("; ")}`);
  }

  logEvent("info", "Production configuration validated");
}
