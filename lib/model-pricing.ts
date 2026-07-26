import { ApiError } from "@/lib/api-error";
import { getErrorLog } from "@/lib/errors";
import { logEvent } from "@/lib/observability";
import { fetchOpenRouterModels } from "@/lib/openrouter";
import { pricingMapFromModels, type ModelPricingMap } from "@/lib/usage";

export async function loadModelPricing(
  options: { required?: boolean } = {}
): Promise<ModelPricingMap> {
  try {
    return pricingMapFromModels(await fetchOpenRouterModels());
  } catch (error) {
    logEvent("warn", "Could not load OpenRouter model pricing", getErrorLog(error));
    if (options.required) {
      throw new ApiError(503, "Model pricing is temporarily unavailable; generation is disabled.");
    }
    return {};
  }
}
