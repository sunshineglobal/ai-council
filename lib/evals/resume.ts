import { ApiError } from "@/lib/api-error";
import type { EvalRunInput } from "@/lib/evals/types";

export type StoredEvalResumeRow = {
  id: string;
  status: string;
  baseline_label: string | null;
  council_config: {
    models?: unknown;
    judgeModel?: unknown;
    debateDepth?: unknown;
    researchEnabled?: unknown;
  } | null;
  eval_sets: StoredEvalSet | StoredEvalSet[] | null;
  eval_scores: Array<{ item_index: number | null; score: number | string | null }> | null;
};

type StoredEvalSet = {
  name?: unknown;
  description?: unknown;
  rubric?: unknown;
  items?: unknown;
};

export type EvalResumeState = {
  evalRunId: string;
  input: EvalRunInput;
  completedIndexes: number[];
  scores: number[];
};

export function parseEvalSetItems(value: unknown): Array<{ prompt: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("prompt" in item)) return [];
    const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
    return prompt ? [{ prompt }] : [];
  });
}

export function buildEvalResumeState(row: StoredEvalResumeRow): EvalResumeState {
  if (row.status === "running") throw new ApiError(409, "This eval is still running.");
  if (row.status === "complete") throw new ApiError(400, "This eval is already complete.");
  if (row.status !== "partial" && row.status !== "failed") {
    throw new ApiError(400, "This eval cannot be resumed.");
  }

  const set = firstRelation(row.eval_sets);
  if (!set) throw new ApiError(400, "Eval set is missing.");

  const items = parseEvalSetItems(set.items);
  const config = row.council_config ?? {};
  const models = Array.isArray(config.models)
    ? config.models.filter((modelId): modelId is string => typeof modelId === "string" && modelId.trim().length > 0)
    : [];
  const judgeModel = typeof config.judgeModel === "string" ? config.judgeModel.trim() : "";
  const debateDepth = typeof config.debateDepth === "number" && Number.isInteger(config.debateDepth)
    ? config.debateDepth
    : 1;
  const name = typeof set.name === "string" ? set.name.trim() : "";
  const rubric = typeof set.rubric === "string" ? set.rubric.trim() : "";

  if (!name || !rubric || !items.length || !models.length || !judgeModel) {
    throw new ApiError(400, "Eval configuration is incomplete.");
  }

  const completed = (row.eval_scores ?? [])
    .map((score) => ({
      index: typeof score.item_index === "number" ? score.item_index : -1,
      score: Number(score.score)
    }))
    .filter((score) => score.index >= 0 && Number.isFinite(score.score))
    .sort((left, right) => left.index - right.index);

  if (completed.length >= items.length) {
    throw new ApiError(400, "This eval has no remaining prompts.");
  }

  return {
    evalRunId: row.id,
    input: {
      name,
      description: typeof set.description === "string" && set.description.trim()
        ? set.description.trim()
        : undefined,
      rubric,
      baselineLabel: row.baseline_label ?? undefined,
      items,
      models,
      judgeModel,
      debateDepth: Math.min(3, Math.max(1, debateDepth)),
      researchEnabled: Boolean(config.researchEnabled)
    },
    completedIndexes: completed.map((score) => score.index),
    scores: completed.map((score) => score.score)
  };
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
