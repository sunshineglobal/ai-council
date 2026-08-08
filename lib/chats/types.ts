import type {
  CouncilAttachment,
  CouncilStage,
  JudgeRanking,
  ResearchSource,
  TokenTotals,
  TokenUsage
} from "@/lib/types";

export type ChatSummary = {
  id: string;
  title: string;
  updated_at: string;
};

export type StoredAttachment = {
  id: string;
  file_id?: string | null;
  filename: string;
  content_type?: string | null;
  contentType?: string;
  file_size?: number;
  fileSize?: number;
  text_preview?: string | null;
  textPreview?: string;
  extraction_status?: CouncilAttachment["extractionStatus"];
  extractionStatus?: CouncilAttachment["extractionStatus"];
  extraction_error?: string | null;
  extractionError?: string;
  created_at?: string;
  createdAt?: string;
};

export type StoredRunAttachment = StoredAttachment & {
  run_id: string;
};

export type StoredRunStatus = "queued" | "running" | "complete" | "failed";

export type StoredRun = {
  id: string;
  prompt_text: string | null;
  final_answer: string | null;
  token_totals: Partial<TokenTotals> | null;
  created_at: string;
  models: string[];
  judge_model: string;
  debate_depth: number;
  research_enabled: boolean;
  status?: StoredRunStatus;
  error_message?: string | null;
  attachments?: StoredAttachment[];
  latency_ms: number;
};

export type StoredModelResponse = {
  id: string;
  run_id: string;
  model_id: string;
  stage: "initial_answer" | "revision";
  content: string | null;
  token_usage: Partial<TokenUsage> | null;
  latency_ms: number;
  status: "complete" | "error";
  error: string | null;
};

export type StoredCritique = {
  id: string;
  run_id: string;
  round_index: number;
  model_id: string;
  content: string | null;
  token_usage: Partial<TokenUsage> | null;
  latency_ms: number;
  status: "complete" | "error";
  error: string | null;
};

export type StoredJudge = {
  id: string;
  run_id: string;
  judge_model: string;
  rankings: JudgeRanking[];
  synthesis: string | null;
  token_usage: Partial<TokenUsage> | null;
  latency_ms: number;
  status: "complete" | "error";
  error: string | null;
};

export type StoredResearch = {
  run_id: string;
  query: string | null;
  results: ResearchSource[];
  result_count: number;
  firecrawl_credits: number;
};

export type StoredUsage = {
  run_id: string;
  stage: CouncilStage;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status: "complete" | "error" | "estimated";
  estimated_cost: number;
};

export type ThreadPayload = {
  thread: { id: string; title: string };
  runs: StoredRun[];
  responses: StoredModelResponse[];
  critiques: StoredCritique[];
  judges: StoredJudge[];
  research: StoredResearch[];
  usage: StoredUsage[];
  attachments: StoredRunAttachment[];
};

export type ThreadDetailsPage = ThreadPayload & {
  nextOlderCursor: string | null;
  hasOlder: boolean;
};
