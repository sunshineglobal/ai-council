import type { TokenTotals, TokenUsage, UsageEvent } from "@/lib/types";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function normalizeUsage(
  usage: unknown,
  promptText: string,
  completionText: string
): TokenUsage {
  const maybe = usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;

  const promptTokens = maybe?.prompt_tokens ?? estimateTokens(promptText);
  const completionTokens = maybe?.completion_tokens ?? estimateTokens(completionText);
  const totalTokens = maybe?.total_tokens ?? promptTokens + completionTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimated:
      maybe?.prompt_tokens === undefined ||
      maybe?.completion_tokens === undefined ||
      maybe?.total_tokens === undefined
  };
}

export function emptyUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimated: Boolean(a.estimated || b.estimated)
  };
}

export function summarizeUsage(events: UsageEvent[]): TokenTotals {
  const totals: TokenTotals = {
    ...emptyUsage(),
    byStage: {},
    byModel: {}
  };

  for (const event of events) {
    totals.promptTokens += event.promptTokens;
    totals.completionTokens += event.completionTokens;
    totals.totalTokens += event.totalTokens;
    totals.estimated = Boolean(totals.estimated || event.estimated);

    const stageUsage = totals.byStage[event.stage] ?? emptyUsage();
    totals.byStage[event.stage] = addUsage(stageUsage, event);

    if (event.modelId) {
      const modelUsage = totals.byModel[event.modelId] ?? emptyUsage();
      totals.byModel[event.modelId] = addUsage(modelUsage, event);
    }
  }

  return totals;
}
