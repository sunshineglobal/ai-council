export type EvalAbortReason = "timeout" | "cancelled";

export type EvalScoreEvent = {
  itemIndex: number;
  prompt: string;
  score: number;
  rationale: string;
  finalAnswer: string;
};

export type EvalEvent =
  | { type: "started"; evalRunId: string; total: number; completed: number }
  | { type: "item_started"; evalRunId: string; itemIndex: number; total: number; prompt: string }
  | ({ type: "item_scored"; evalRunId: string; total: number } & EvalScoreEvent)
  | { type: "complete"; evalRunId: string; aggregateScore: number; scored: number; total: number }
  | {
      type: "partial";
      evalRunId: string;
      aggregateScore: number;
      scored: number;
      total: number;
      reason: EvalAbortReason;
    }
  | { type: "error"; message: string; evalRunId?: string };
