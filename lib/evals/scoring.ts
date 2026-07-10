import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { completeWithOpenRouter, type CompletionResult } from "@/lib/openrouter";

const scoreOutputSchema = z.object({
  score: z.number().finite().min(0).max(100),
  rationale: z.string().trim().min(1).max(4000)
});

export type ParsedEvalScore = {
  score: number;
  rationale: string;
};

export function buildEvalScoreMessages(params: {
  prompt: string;
  rubric: string;
  answer: string;
}): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: "Score the answer from 0 to 100 against the rubric. Return JSON only."
    },
    {
      role: "user",
      content: `Prompt:\n${params.prompt}\n\nRubric:\n${params.rubric}\n\nAnswer:\n${params.answer}\n\nReturn {"score": number, "rationale": "short explanation"}.`
    }
  ];
}

export function parseEvalScoreOutput(content: string): ParsedEvalScore {
  try {
    const parsed = scoreOutputSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return { score: 0, rationale: content };
    return {
      score: parsed.data.score,
      rationale: parsed.data.rationale
    };
  } catch {
    return { score: 0, rationale: content };
  }
}

export async function scoreEvalAnswer(params: {
  judgeModel: string;
  prompt: string;
  rubric: string;
  answer: string;
  signal?: AbortSignal;
}): Promise<ParsedEvalScore & { completion: CompletionResult }> {
  const completion = await completeWithOpenRouter({
    model: params.judgeModel,
    responseFormat: "json_object",
    temperature: 0,
    maxTokens: 600,
    signal: params.signal,
    messages: buildEvalScoreMessages(params)
  });

  return {
    ...parseEvalScoreOutput(completion.content),
    completion
  };
}
