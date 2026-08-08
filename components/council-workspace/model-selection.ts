import type { ModelOption } from "@/lib/types";

export const DEFAULT_JUDGE = "z-ai/glm-5.2";
export const DEFAULT_COUNCIL = [
  "minimax/minimax-m3",
  "stepfun/step-3.7-flash",
  "xiaomi/mimo-v2.5-pro"
];

export function reconcileCouncilModels(current: string[], available: ModelOption[]): string[] {
  const availableIds = new Set(available.map((model) => model.id));
  const retained = current.filter((modelId) => availableIds.has(modelId));
  if (retained.length && !isDefaultCouncil(current)) return retained;

  const validDefaults = DEFAULT_COUNCIL.filter((id) => availableIds.has(id));
  return validDefaults.length ? validDefaults : available.slice(0, 3).map((model) => model.id);
}

export function reconcileJudgeModel(current: string, available: ModelOption[]): string {
  if (current && available.some((model) => model.id === current)) return current;
  return available.some((model) => model.id === DEFAULT_JUDGE)
    ? DEFAULT_JUDGE
    : available[0]?.id ?? "";
}

export function isDefaultCouncil(models: string[]): boolean {
  return models.length === DEFAULT_COUNCIL.length
    && models.every((modelId, index) => modelId === DEFAULT_COUNCIL[index]);
}
