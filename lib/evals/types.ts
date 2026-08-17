import type { infer as ZodInfer } from "zod";
import type { evalRunSchema } from "@/lib/validation";

export type EvalRunInput = ZodInfer<typeof evalRunSchema>;

import type { EvalAbortReason } from "@/lib/evals/events";

export type EvalRunResult = {
  evalRunId: string;
  aggregateScore: number;
  status: "complete" | "partial";
  scored: number;
  total: number;
  reason?: EvalAbortReason;
};
