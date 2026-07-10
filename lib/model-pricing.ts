import { getErrorLog } from "@/lib/errors";
import { fetchOpenRouterModels } from "@/lib/openrouter";
import { pricingMapFromModels, type ModelPricingMap } from "@/lib/usage";

export async function loadModelPricing(): Promise<ModelPricingMap> {
  try {
    return pricingMapFromModels(await fetchOpenRouterModels());
  } catch (error) {
    console.warn("[pricing] could not load OpenRouter model pricing", getErrorLog(error));
    return {};
  }
}
