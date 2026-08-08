export type WorkspacePreferences = {
  models: string[];
  judgeModel: string;
  debateDepth: number;
  researchEnabled: boolean;
};

const STORAGE_KEY = "ai-council.workspace-preferences.v1";

export function readWorkspacePreferences(): WorkspacePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    if (!Array.isArray(parsed.models) || typeof parsed.judgeModel !== "string") return null;
    const debateDepth = parsed.debateDepth;
    if (!Number.isInteger(debateDepth) || debateDepth === undefined || debateDepth < 1) return null;
    return {
      models: parsed.models.filter((modelId): modelId is string => typeof modelId === "string" && modelId.trim().length > 0),
      judgeModel: parsed.judgeModel,
      debateDepth,
      researchEnabled: Boolean(parsed.researchEnabled)
    };
  } catch {
    return null;
  }
}

export function writeWorkspacePreferences(preferences: WorkspacePreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function filterAvailableModelIds(modelIds: string[], availableIds: Set<string>): string[] {
  return modelIds.filter((modelId) => availableIds.has(modelId));
}
