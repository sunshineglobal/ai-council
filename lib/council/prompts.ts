import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CritiqueResult, StageResult } from "@/lib/types";

const PEER_ANSWER_CONTEXT_CHARS = 3200;
const CRITIQUE_ROUND_CONTEXT_CHARS = 2400;

export function buildSharedPrefixMessages(
  prompt: string,
  researchContext: string,
  attachmentContext: string
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: "You are a member or judge of a private AI council participating in a collaborative intelligence process."
    },
    {
      role: "user",
      content: [
        researchContext && `Shared research context:\n${researchContext}`,
        attachmentContext && `Attached file context:\n${attachmentContext}`,
        `User prompt:\n${prompt}`
      ]
        .filter(Boolean)
        .join("\n\n")
    },
    {
      role: "assistant",
      content: "Acknowledged. Please provide the specific instructions and inputs for the current stage."
    }
  ];
}

export function buildInitialMessages(
  prompt: string,
  researchContext: string,
  attachmentContext: string
): ChatCompletionMessageParam[] {
  return [
    ...buildSharedPrefixMessages(prompt, researchContext, attachmentContext),
    {
      role: "user",
      content:
        "Produce an independent, high-quality answer to the user prompt. Use the supplied research and file contexts when relevant. Cite sources as [1], [2], etc."
    }
  ];
}

export function buildCritiqueMessages(params: {
  modelId: string;
  prompt: string;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  previousRounds: CritiqueResult[][];
  roundIndex: number;
}): ChatCompletionMessageParam[] {
  const peerResponses = params.initialResponses
    .filter((response) => response.modelId !== params.modelId || response.content)
    .map((response) => {
      const label = `${response.modelId}${response.modelId === params.modelId ? " (you)" : ""}`;
      const body = response.content
        ? response.modelId === params.modelId
          ? truncateCouncilText(response.content, PEER_ANSWER_CONTEXT_CHARS)
          : summarizeCouncilText(response.content, 200)
        : `[no response: ${truncateCouncilText(response.error ?? "empty", 160)}]`;
      return `${label}:\n${body}`;
    })
    .join("\n\n");
  const previous = params.previousRounds
    .flat()
    .filter((critique) => critique.content || critique.error)
    .map(
      (critique) =>
        `R${critique.roundIndex} ${critique.modelId}:\n${truncateCouncilText(
          critique.content || critique.error || "",
          CRITIQUE_ROUND_CONTEXT_CHARS
        )}`
    )
    .join("\n\n");

  return [
    ...buildSharedPrefixMessages(params.prompt, params.researchContext, params.attachmentContext),
    {
      role: "user",
      content: [
        `Initial council answers:\n${peerResponses}`,
        previous && `Previous debate rounds:\n${previous}`,
        `This is debate round ${params.roundIndex}. Critique the other answers, name concrete weaknesses, keep what is strong, and propose improvements. Be concise and evidence-driven. Respond as ${params.modelId}.`
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}

export function buildRevisionMessages(params: {
  modelId: string;
  prompt: string;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
}): ChatCompletionMessageParam[] {
  const ownInitial = params.initialResponses.find((response) => response.modelId === params.modelId)?.content ?? "";
  const critiques = params.critiqueRounds
    .flat()
    .filter((critique) => critique.content || critique.error)
    .map(
      (critique) =>
        `R${critique.roundIndex} ${critique.modelId}:\n${truncateCouncilText(
          critique.content || critique.error || "",
          CRITIQUE_ROUND_CONTEXT_CHARS
        )}`
    )
    .join("\n\n");

  return [
    ...buildSharedPrefixMessages(params.prompt, params.researchContext, params.attachmentContext),
    {
      role: "user",
      content: [
        `Your initial answer:\n${truncateCouncilText(ownInitial, PEER_ANSWER_CONTEXT_CHARS)}`,
        `Council critiques:\n${critiques}`,
        "Write your revised answer now. Preserve correct details, fix weaknesses, and produce your strongest final answer."
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}

export function buildJudgeMessages(params: {
  prompt: string;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  revisions: StageResult[];
}): ChatCompletionMessageParam[] {
  return [
    ...buildSharedPrefixMessages(params.prompt, params.researchContext, params.attachmentContext),
    {
      role: "user",
      content: buildJudgePrompt(params)
    }
  ];
}

export function buildJudgePrompt(params: {
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  revisions: StageResult[];
}): string {
  const initial = params.initialResponses
    .map(
      (response) =>
        `${response.modelId}:\n${truncateCouncilText(response.content || response.error || "", PEER_ANSWER_CONTEXT_CHARS)}`
    )
    .join("\n\n");
  const debate = params.critiqueRounds
    .flat()
    .map(
      (critique) =>
        `R${critique.roundIndex} ${critique.modelId}:\n${truncateCouncilText(
          critique.content || critique.error || "",
          CRITIQUE_ROUND_CONTEXT_CHARS
        )}`
    )
    .join("\n\n");
  const revisions = params.revisions
    .map(
      (response) =>
        `${response.modelId}:\n${truncateCouncilText(response.content || response.error || "", PEER_ANSWER_CONTEXT_CHARS)}`
    )
    .join("\n\n");

  return `Initial answers:
${initial}

Debate:
${debate}

Revised answers:
${revisions}

Return JSON with this shape:
{
  "final_answer": "the best final response",
  "consensus": "what the council agrees on",
  "disagreements": ["important disagreements"],
  "blind_spots": ["remaining uncertainty"],
  "rankings": [
    { "model_id": "model id", "rank": 1, "score": 95, "rationale": "why" }
  ]
}`;
}

export function summarizeCouncilText(text: string, maxTokens = 200): string {
  if (!text) return "";
  const maxChars = maxTokens * 4.5;
  if (text.length <= maxChars) return text;

  const lines = text.split("\n");
  const extractedLines: string[] = [];
  let currentLength = 0;
  let introCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;
    extractedLines.push(line);
    currentLength += line.length + 1;
    introCount += 1;
    if (introCount >= 3 || currentLength > maxChars * 0.45) break;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line.startsWith("#")) {
      extractedLines.push(line);
      currentLength += line.length + 1;

      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex]?.trim();
        if (nextLine && !nextLine.startsWith("#")) {
          extractedLines.push(`  ${nextLine}`);
          currentLength += nextLine.length + 3;
          break;
        }
      }
    } else if (line.startsWith("-") || line.startsWith("*") || /^\d+\./.test(line)) {
      if (currentLength < maxChars * 0.8 && line.length < 150) {
        extractedLines.push(line);
        currentLength += line.length + 1;
      }
    }
    if (currentLength > maxChars) break;
  }

  const result = extractedLines.join("\n").trim();
  return result.length > maxChars ? `${result.slice(0, maxChars)}\n...[truncated summary]` : result;
}

export function truncateCouncilText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}
