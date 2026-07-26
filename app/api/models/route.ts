import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { requireApiProfile } from "@/lib/auth";
import { getAllowedModelIds, getOptionalEnv } from "@/lib/env";
import { getErrorLog } from "@/lib/errors";
import { logEvent } from "@/lib/observability";
import { fetchOpenRouterModels } from "@/lib/openrouter";
import { parsePricingValue } from "@/lib/usage";

export const GET = apiRoute(async () => {
  try {
    await requireApiProfile();
    const allowedIds = getAllowedModelIds();
    const allowed = new Set(allowedIds);
    const models = (await fetchOpenRouterModels()).filter((model) =>
      allowed.has(model.id)
      && parsePricingValue(model.pricing?.prompt) !== undefined
      && parsePricingValue(model.pricing?.completion) !== undefined
    );
    if (!models.length) {
      throw new ApiError(503, "No allowlisted models with enforceable pricing are currently available.");
    }
    return NextResponse.json({
      models,
      researchAvailable: Boolean(getOptionalEnv("FIRECRAWL_API_KEY"))
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("OpenRouter")) {
      logEvent("warn", "Model discovery unavailable; generation disabled", getErrorLog(error));
      throw new ApiError(503, "Model pricing is temporarily unavailable; generation is disabled.");
    }
    throw error;
  }
});
