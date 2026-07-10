import type { infer as ZodInfer } from "zod";
import type { evalRunSchema } from "@/lib/validation";

export type EvalRunInput = ZodInfer<typeof evalRunSchema>;

export type EvalRunResult = {
  evalRunId: string;
  aggregateScore: number;
};
