import type { BudgetStatus, UsageBreakdownRow } from "@/lib/usage";

export type RecentCouncilRun = {
  id: string;
  threadId: string | null;
  prompt: string | null;
  status: string;
  createdAt: string;
  models: string[];
  judgeModel: string;
  debateDepth: number;
  researchEnabled: boolean;
  latencyMs: number;
  totalTokens: number;
  estimatedCost: number;
};

export type AdminUsageResponse = {
  subject?: { id: string; email: string };
  range: { from: string; to: string };
  budget: {
    monthlyBudgetUsd: number | null;
    status: BudgetStatus;
    percentUsed: number | null;
    remainingUsd: number | null;
  };
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimated?: boolean;
    estimatedCost: number;
    eventCount: number;
    latencyMs: number;
    evalCount: number;
    firecrawlCredits: number;
    firecrawlResults: number;
  };
  byStage: UsageBreakdownRow[];
  byModel: UsageBreakdownRow[];
  recentRuns: RecentCouncilRun[];
};
