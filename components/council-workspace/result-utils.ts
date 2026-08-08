import type {
  CouncilAttachment,
  CouncilRunResult,
  CritiqueResult,
  JudgeResult,
  ModelOption,
  ResearchResult,
  UsageEvent
} from "@/lib/types";
import type { StoredAttachment, StoredRun, ThreadPayload } from "@/components/council-workspace/types";

export type ParsedCouncilAnswer = {
  mainAnswer: string;
  consensus: string;
  disagreements: string[];
  blindSpots: string[];
};

export function reconstructRunResult(run: StoredRun, thread: ThreadPayload): CouncilRunResult {
  const responses = thread.responses
    .filter((response) => response.run_id === run.id)
    .map((response) => ({
      id: response.id,
      modelId: response.model_id,
      stage: response.stage,
      content: response.content ?? "",
      usage: normalizeStoredTokenUsage(response.token_usage),
      latencyMs: response.latency_ms,
      status: response.status,
      error: response.error ?? undefined
    }));

  const initialResponses = responses.filter((response) => response.stage === "initial_answer");
  const revisions = responses.filter((response) => response.stage === "revision");

  const runCritiques = thread.critiques
    .filter((critique) => critique.run_id === run.id)
    .map((critique) => ({
      id: critique.id,
      roundIndex: critique.round_index,
      modelId: critique.model_id,
      content: critique.content ?? "",
      usage: normalizeStoredTokenUsage(critique.token_usage),
      latencyMs: critique.latency_ms,
      status: critique.status,
      error: critique.error ?? undefined
    }));

  const critiqueRounds: CritiqueResult[][] = [];
  for (const critique of runCritiques) {
    const roundIndex = Math.max(0, critique.roundIndex - 1);
    const round = critiqueRounds[roundIndex] ?? [];
    critiqueRounds[roundIndex] = [...round, critique];
  }

  const storedJudge = thread.judges.find((judge) => judge.run_id === run.id);
  const judge: JudgeResult = storedJudge
    ? {
        id: storedJudge.id,
        modelId: storedJudge.judge_model,
        synthesis: storedJudge.synthesis ?? "",
        rankings: storedJudge.rankings,
        usage: normalizeStoredTokenUsage(storedJudge.token_usage),
        latencyMs: storedJudge.latency_ms,
        status: storedJudge.status,
        error: storedJudge.error ?? undefined
      }
    : {
        id: "unknown",
        modelId: run.judge_model,
        synthesis: run.final_answer ?? "",
        rankings: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0,
        status: "complete"
      };

  const storedResearch = thread.research.find((research) => research.run_id === run.id);
  const research: ResearchResult | undefined = storedResearch
    ? {
        query: storedResearch.query ?? "",
        sources: storedResearch.results,
        credits: Number(storedResearch.firecrawl_credits || 0),
        estimatedContextTokens: storedResearch.result_count * 300
      }
    : undefined;

  const usageEvents: UsageEvent[] = thread.usage
    .filter((usage) => usage.run_id === run.id)
    .map((usage) => ({
      stage: usage.stage,
      modelId: usage.model_id,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      latencyMs: usage.latency_ms,
      status: usage.status,
      estimatedCost: Number(usage.estimated_cost || 0)
    }));

  return {
    id: run.id,
    threadId: thread.thread.id,
    prompt: run.prompt_text ?? undefined,
    finalAnswer: run.final_answer ?? "",
    models: run.models,
    judgeModel: run.judge_model,
    debateDepth: run.debate_depth,
    researchEnabled: run.research_enabled,
    savedMode: true,
    attachments: (run.attachments ?? []).map(normalizeStoredAttachment),
    research,
    initialResponses,
    critiqueRounds,
    revisions,
    judge,
    usageEvents,
    tokenTotals: normalizeStoredTokenTotals(run.token_totals),
    costEstimate: usageEvents.reduce((sum, usage) => sum + usage.estimatedCost, 0),
    latencyMs: run.latency_ms,
    createdAt: run.created_at
  };
}

export function normalizeStoredAttachment(attachment: StoredAttachment): CouncilAttachment {
  return {
    id: attachment.file_id ?? attachment.id,
    filename: attachment.filename,
    contentType: attachment.contentType ?? attachment.content_type ?? "application/octet-stream",
    fileSize: Number(attachment.fileSize ?? attachment.file_size ?? 0),
    textPreview: attachment.textPreview ?? attachment.text_preview ?? undefined,
    extractionStatus: attachment.extractionStatus ?? attachment.extraction_status ?? "none",
    extractionError: attachment.extractionError ?? attachment.extraction_error ?? undefined,
    createdAt: attachment.createdAt ?? attachment.created_at ?? ""
  };
}

function normalizeStoredTokenTotals(totals: StoredRun["token_totals"]): CouncilRunResult["tokenTotals"] {
  return {
    promptTokens: totals?.promptTokens ?? 0,
    completionTokens: totals?.completionTokens ?? 0,
    totalTokens: totals?.totalTokens ?? 0,
    estimated: totals?.estimated,
    byStage: totals?.byStage ?? {},
    byModel: totals?.byModel ?? {}
  };
}

function normalizeStoredTokenUsage(usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number; estimated?: boolean } | null) {
  return {
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    estimated: usage?.estimated
  };
}

export function parseCouncilAnswer(text: string): ParsedCouncilAnswer {
  let jsonText = text.trim();
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7).trim();
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3).trim();

  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        mainAnswer: String(record.final_answer ?? record.finalAnswer ?? "").trim(),
        consensus: String(record.consensus ?? "").trim(),
        disagreements: normalizeStringArray(record.disagreements),
        blindSpots: normalizeStringArray(record.blind_spots ?? record.blindSpots)
      };
    }
  } catch {
    // Council output may be plain Markdown or partially formed JSON.
  }

  const looseAnswer = extractLooseJsonStringField(jsonText, "final_answer")
    ?? extractLooseJsonStringField(jsonText, "finalAnswer");
  if (looseAnswer) {
    return {
      mainAnswer: looseAnswer.trim(),
      consensus: (extractLooseJsonStringField(jsonText, "consensus") ?? "").trim(),
      disagreements: extractLooseJsonArrayField(jsonText, "disagreements"),
      blindSpots: [
        ...extractLooseJsonArrayField(jsonText, "blind_spots"),
        ...extractLooseJsonArrayField(jsonText, "blindSpots")
      ]
    };
  }

  const sections = text.split(/\n\n(?=Consensus\n|Disagreements\n|Blind spots\n)/i);
  const mainAnswer = sections[0] ?? text;
  let consensus = "";
  const disagreements: string[] = [];
  const blindSpots: string[] = [];

  for (const section of sections.slice(1)) {
    if (/^Consensus\n/i.test(section)) {
      consensus = section.replace(/^Consensus\n/i, "").trim();
    } else if (/^Disagreements\n/i.test(section)) {
      disagreements.push(...parseLooseList(section.replace(/^Disagreements\n/i, "")));
    } else if (/^Blind spots\n/i.test(section)) {
      blindSpots.push(...parseLooseList(section.replace(/^Blind spots\n/i, "")));
    }
  }

  return { mainAnswer: mainAnswer.trim(), consensus, disagreements, blindSpots };
}

export function compactTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length > 52 ? `${trimmed.slice(0, 49)}...` : trimmed;
}

export function modelLabel(models: ModelOption[], modelId: string): string {
  return models.find((model) => model.id === modelId)?.name ?? modelId;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function extractLooseJsonStringField(text: string, field: string): string | undefined {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(text);
  if (!match) return undefined;
  return decodeJsonStringFragment(match[1]);
}

function extractLooseJsonArrayField(text: string, field: string): string[] {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedField}"\\s*:\\s*\\[([\\s\\S]*?)]`).exec(text);
  if (!match) return [];

  const values: string[] = [];
  const itemPattern = /"((?:\\.|[^"\\])*)"/g;
  let item: RegExpExecArray | null;
  while ((item = itemPattern.exec(match[1])) !== null) {
    const decoded = decodeJsonStringFragment(item[1]).trim();
    if (decoded) values.push(decoded);
  }
  return values;
}

function decodeJsonStringFragment(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
}

function parseLooseList(value: string): string[] {
  return value
    .trim()
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
}
