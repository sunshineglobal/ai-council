import { z } from "zod";
import type { JudgeRanking } from "@/lib/types";

const rankingSchema = z
  .object({
    model_id: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    rank: z.number().int().positive(),
    score: z.number().finite().min(0).max(100),
    rationale: z.string().default("")
  })
  .refine((ranking) => Boolean(ranking.model_id ?? ranking.modelId), {
    message: "Each judge ranking requires a model id."
  });

const judgeOutputSchema = z.object({
  final_answer: z.string().trim().min(1),
  consensus: z.string().trim().optional(),
  disagreements: z.array(z.string()).default([]),
  blind_spots: z.array(z.string()).default([]),
  rankings: z.array(rankingSchema).default([])
});

export class JudgeOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeOutputValidationError";
  }
}

export function parseJudgeOutput(
  content: string,
  allowedModelIds: readonly string[]
): { synthesis: string; rankings: JudgeRanking[] } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(unwrapJsonFence(content));
  } catch {
    throw new JudgeOutputValidationError("Judge returned invalid JSON.");
  }

  const parsed = judgeOutputSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new JudgeOutputValidationError(parsed.error.issues[0]?.message ?? "Judge returned an invalid result.");
  }

  const allowed = new Set(allowedModelIds);
  const seenModels = new Set<string>();
  const seenRanks = new Set<number>();
  const rankings = parsed.data.rankings.map((ranking) => {
    const modelId = ranking.model_id ?? ranking.modelId;
    if (!modelId || !allowed.has(modelId)) {
      throw new JudgeOutputValidationError("Judge ranked a model that was not in this council run.");
    }
    if (seenModels.has(modelId) || seenRanks.has(ranking.rank)) {
      throw new JudgeOutputValidationError("Judge returned duplicate models or ranks.");
    }
    seenModels.add(modelId);
    seenRanks.add(ranking.rank);

    return {
      modelId,
      rank: ranking.rank,
      score: ranking.score,
      rationale: ranking.rationale
    };
  });
  const sections = [
    parsed.data.final_answer,
    parsed.data.consensus && `Consensus\n${parsed.data.consensus}`,
    parsed.data.disagreements.length > 0 &&
      `Disagreements\n${parsed.data.disagreements.map((item) => `- ${item}`).join("\n")}`,
    parsed.data.blind_spots.length > 0 &&
      `Blind spots\n${parsed.data.blind_spots.map((item) => `- ${item}`).join("\n")}`
  ].filter((section): section is string => Boolean(section));

  return { synthesis: sections.join("\n\n"), rankings };
}

function unwrapJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
